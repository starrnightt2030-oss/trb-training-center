#!/usr/bin/env node
/* ============================================================================
   sync-attendance.mjs — مزامنة الطلاب والغياب من «السستم» إلى منصة الترسانة
   ----------------------------------------------------------------------------
   يقرأ قاعدة بيانات نظام «السستم» (SQLite) ويرفع:
     ١) بيانات الطلاب      → جدول students
     ٢) سجلات الغياب        → جدول attendance_records   (غير الحاضرين فقط)
     ٣) ملخّص الحضور        → جدول attendance_summaries
     ٤) سجل عملية المزامنة  → جدول import_batches

   التشغيل:  node tools/sync-attendance.mjs [--dry-run] [--verbose]
   لا يحتاج أي حزمة خارجية — يعتمد على fetch المدمج في Node 18+.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* كتم تحذير «SQLite تجريبي» الصادر عن node:sqlite حتى لا يشوّش التقرير */
const _emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const txt = String(warning);
  if (txt.includes('SQLite is an experimental feature')) return;
  return _emitWarning.call(process, warning, ...rest);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = __dirname;                       // مجلد tools
const PROJECT_DIR = path.resolve(__dirname, '..'); // جذر المشروع
const LOGS_DIR = path.join(TOOLS_DIR, 'logs');

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const VERBOSE = ARGS.includes('--verbose');

/* ─────────────────────────────── السجل والتقرير ────────────────────────── */

const LOG_LINES = [];
const WARNINGS = [];
const ERRORS = [];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function logFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `sync-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.log`;
}
/** يطبع على الشاشة ويحفظ في ملف السجل */
function say(msg = '') {
  console.log(msg);
  LOG_LINES.push(`[${stamp()}] ${msg}`);
}
/** يحفظ في ملف السجل فقط (تفاصيل مطوّلة) */
function detail(msg) {
  LOG_LINES.push(`[${stamp()}]   · ${msg}`);
  if (VERBOSE) console.log('   · ' + msg);
}
function warn(msg) {
  WARNINGS.push(msg);
  LOG_LINES.push(`[${stamp()}] ⚠ ${msg}`);
  if (VERBOSE) console.log('⚠ ' + msg);
}
function fail(msg) {
  ERRORS.push(msg);
  LOG_LINES.push(`[${stamp()}] ✖ ${msg}`);
}
function flushLog() {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const file = path.join(LOGS_DIR, logFileName());
    fs.writeFileSync(file, LOG_LINES.join('\n') + '\n', 'utf8');
    console.log(`\nتقرير مفصّل: ${file}`);
  } catch (e) {
    console.log(`\n(تعذّر كتابة ملف السجل: ${e.message})`);
  }
}

/* ────────────────────────── قراءة الإعدادات والمفاتيح ──────────────────── */

const DEFAULT_CONFIG = {
  /* مسار مجلد نظام «السستم» على هذا الجهاز */
  schoolSystemPath: 'C:\\Users\\Target\\Desktop\\السستم\\SchoolSystem',
  /* "active" = السنة النشطة في السستم، أو اسم صريح مثل "2026/2027" */
  academicYear: 'active',
  /* رفع بيانات الطلاب مع الغياب */
  syncStudents: true,
  /* تحويل حالات الغياب من السستم إلى حالات المنصة */
  statusMap: {
    present: 'present',
    absent: 'absent',
    sick: 'excused',
    excused: 'excused',
    loss: 'absent'
  },
  /* حالات الطلاب التي تُرفع إلى المنصة */
  includeStudentStatuses: ['active', 'suspended'],
  /* أنواع أيام التقويم التي لا تُحتسب أيام دراسة (مطابق لمنطق السستم) */
  excludeCalendarDayTypes: ['official', 'eid', 'emergency', 'exam'],
  /* استبعاد الجمعة من أيام الدراسة (منطق السستم: الجمعة ليست يوم دراسة) */
  excludeFriday: true,
  /* مرادفات التخصصات: "اسم التخصص في السستم": "الاسم أو الـ slug في المنصة" */
  specializationAliases: {},
  /* حجم الدفعة عند الرفع */
  batchSize: 500
};

const CONFIG_PATH = path.join(TOOLS_DIR, 'sync.config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
    say(`أُنشئ ملف الإعدادات الافتراضي: ${CONFIG_PATH}`);
    say('راجع قيمة schoolSystemPath بداخله إن كان مسار «السستم» مختلفًا.');
    return { ...DEFAULT_CONFIG };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`ملف الإعدادات tools/sync.config.json غير صالح (خطأ JSON): ${e.message}`);
  }
  const cfg = { ...DEFAULT_CONFIG, ...raw };
  cfg.statusMap = { ...DEFAULT_CONFIG.statusMap, ...(raw.statusMap || {}) };
  cfg.specializationAliases = { ...(raw.specializationAliases || {}) };
  return cfg;
}

/** قارئ بسيط لملفات .env */
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function loadCredentials() {
  const envSync = readEnvFile(path.join(TOOLS_DIR, '.env.sync'));
  const envProj = readEnvFile(path.join(PROJECT_DIR, '.env'));
  const url = (envSync.SUPABASE_URL || process.env.SUPABASE_URL || envProj.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = (envSync.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  return { url, key, publicKey: (envProj.VITE_SUPABASE_ANON_KEY || '').trim() };
}

/**
 * التحقق من نوع المفتاح قبل أي اتصال.
 *
 * المفتاح العام (sb_publishable_… أو anon) لا يتجاوز سياسات الحماية RLS،
 * فلو استُخدم في المزامنة يفشل أول إدراج برسالة غامضة:
 *   42501 new row violates row-level security policy
 * والاكتشاف المبكر هنا يوفّر على المستخدم تتبّع خطأ لا علاقة له بسببه.
 */
function assertSecretKey(key, publicKey) {
  if (!key) return;

  if (key.startsWith('sb_publishable_')) {
    throw new Error(
      'المفتاح المحفوظ في tools/.env.sync هو المفتاح العام (Publishable) لا المفتاح السرّي.\n' +
      'المفتاح العام لا يملك صلاحية الكتابة — لذلك ترفضه قاعدة البيانات.\n\n' +
      'الصحيح: افتح لوحة Supabase ▸ Project Settings ▸ API Keys ▸ Secret keys ▸ default\n' +
      '        اكشف المفتاح وانسخه (يبدأ بـ sb_secret_).\n' +
      'ثم احذف الملف tools/.env.sync وشغّل «مزامنة-الغياب.bat» من جديد.'
    );
  }

  // المفاتيح تُعرض مقصوصة في لوحة Supabase (sb_secret_iYoP…)، ومن ينسخ النصّ
  // الظاهر بدل الضغط على أيقونة النسخ يحصل على أول محارف فقط. الخادم يردّ
  // عندها «Invalid API key» بلا أي إشارة إلى أن المفتاح ناقص.
  if (key.length < 30) {
    throw new Error(
      `المفتاح المحفوظ ناقص — طوله ${key.length} محرفًا فقط، والمفتاح الكامل يتجاوز ٤٠.\n` +
      'غالبًا نُسخ النصّ المقصوص الظاهر على الشاشة بدل المفتاح كاملًا.\n\n' +
      'الصحيح: في لوحة Supabase ▸ Project Settings ▸ API Keys ▸ Secret keys\n' +
      '        اضغط أيقونة النسخ بجوار المفتاح (لا تحدّد النص بالفأرة).\n' +
      'ثم احذف الملف tools/.env.sync وشغّل «مزامنة-الغياب.bat» من جديد.'
    );
  }

  if (publicKey && key === publicKey) {
    throw new Error(
      'المفتاح المحفوظ في tools/.env.sync هو نفسه مفتاح الموقع العام الموجود في .env.\n' +
      'المزامنة تحتاج المفتاح السرّي (Secret / service_role) لا العام.\n' +
      'احذف tools/.env.sync وشغّل «مزامنة-الغياب.bat» من جديد بالمفتاح الصحيح.'
    );
  }

  // مفتاح JWT قديم: نقرأ الدور المكتوب داخله للتأكد أنه service_role لا anon
  if (key.startsWith('eyJ')) {
    try {
      const body = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (body.role && body.role !== 'service_role') {
        throw new Error(
          `المفتاح المحفوظ من نوع «${body.role}» لا «service_role».\n` +
          'المزامنة تحتاج مفتاح service_role لأنه وحده يتجاوز سياسات الحماية.\n' +
          'احذف tools/.env.sync وشغّل «مزامنة-الغياب.bat» من جديد بالمفتاح الصحيح.'
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('service_role')) throw e;
      /* تعذّر فكّ المفتاح — نتركه ليحكم عليه الخادم */
    }
  }
}

/* ───────────────────────────── فتح قاعدة السستم ────────────────────────── */

/** ينسخ ملفات القاعدة الثلاثة إلى مجلد مؤقت (للتعامل مع وضع WAL أثناء التشغيل) */
function copyDbToTemp(dbPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-db-'));
  for (const suffix of ['', '-wal', '-shm']) {
    const src = dbPath + suffix;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, 'school.db' + suffix));
  }
  return path.join(dir, 'school.db');
}

/** غلاف موحّد فوق better-sqlite3 و node:sqlite */
function wrap(db, driver) {
  return {
    driver,
    all(sql, ...params) { return db.prepare(sql).all(...params); },
    get(sql, ...params) { return db.prepare(sql).get(...params); },
    close() { try { db.close(); } catch { /* تجاهل */ } }
  };
}

async function openDatabase(schoolSystemPath) {
  const dbPath = path.join(schoolSystemPath, 'data', 'school.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `لم يُعثر على قاعدة بيانات السستم في:\n  ${dbPath}\n` +
      `صحّح قيمة "schoolSystemPath" داخل tools/sync.config.json لتشير إلى مجلد SchoolSystem.`
    );
  }

  const attemptErrors = [];

  /* ١) better-sqlite3 من داخل node_modules الخاص بالسستم (مبني لويندوز هناك) */
  const tryBetter = (targetPath) => {
    const req = createRequire(path.join(schoolSystemPath, 'package.json'));
    const Database = req('better-sqlite3');
    const db = new Database(targetPath, { readonly: true, fileMustExist: true });
    db.prepare('SELECT count(*) c FROM students').get();
    return wrap(db, 'better-sqlite3');
  };

  /* ٢) node:sqlite المدمج (بديل عند تعذّر الوحدة الأصلية) */
  const tryNodeSqlite = async (targetPath, readOnly) => {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(targetPath, readOnly ? { readOnly: true } : {});
    db.prepare('SELECT count(*) c FROM students').get();
    return wrap(db, 'node:sqlite');
  };

  const plan = [
    ['better-sqlite3 (قراءة مباشرة)', async () => tryBetter(dbPath)],
    ['better-sqlite3 (نسخة مؤقتة)', async () => tryBetter(copyDbToTemp(dbPath))],
    ['node:sqlite (قراءة مباشرة)', async () => tryNodeSqlite(dbPath, true)],
    ['node:sqlite (نسخة مؤقتة)', async () => tryNodeSqlite(copyDbToTemp(dbPath), false)]
  ];

  for (const [label, fn] of plan) {
    try {
      const db = await fn();
      detail(`فتح القاعدة عبر: ${label}`);
      return db;
    } catch (e) {
      attemptErrors.push(`${label}: ${e.message}`);
    }
  }

  throw new Error(
    'تعذّر فتح قاعدة بيانات السستم بأي طريقة.\n' +
    'الحل المقترح:\n' +
    '  ١) أغلق نظام «السستم» إن كان يعمل، ثم أعد التشغيل.\n' +
    '  ٢) تأكد أن مجلد node_modules داخل SchoolSystem موجود (شغّل npm install هناك).\n' +
    '  ٣) أو حدّث Node.js إلى إصدار 22.5 أو أحدث ليتوفّر node:sqlite المدمج.\n' +
    'تفاصيل المحاولات:\n  - ' + attemptErrors.join('\n  - ')
  );
}

/* ──────────────────────── تطبيع النصوص العربية للمطابقة ────────────────── */

const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const AR_INDIC = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

function normalizeAr(s) {
  if (!s) return '';
  return String(s)
    .replace(AR_DIACRITICS, '')
    .replace(/[٠-٩]/g, (d) => AR_INDIC[d])
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** نسخة «مخفّفة»: بلا أرقام وبلا أل التعريف — لمطابقة «تركيبات كهربية1» بـ«التركيبات الكهربائية» */
function loosenAr(s) {
  return normalizeAr(s)
    .replace(/\d+/g, ' ')
    .split(' ')
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** تنظيف الرقم القومي: أرقام فقط */
function cleanNid(s) {
  if (!s) return null;
  const digits = String(s).replace(/[٠-٩]/g, (d) => AR_INDIC[d]).replace(/\D+/g, '');
  return digits.length ? digits : null;
}

function cleanText(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

/* ───────────────────────────── عميل Supabase REST ──────────────────────── */

function makeClient(url, key) {
  const base = `${url}/rest/v1`;
  async function call(method, endpoint, { body, prefer, headers } = {}) {
    const res = await fetch(base + endpoint, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...(headers || {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} على ${method} ${endpoint} :: ${text.slice(0, 500)}`);
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  return {
    /** يجلب كل صفوف جدول على دفعات */
    async selectAll(table, select, extraQuery = '') {
      const out = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const q = `/${table}?select=${encodeURIComponent(select)}${extraQuery}&limit=${pageSize}&offset=${offset}`;
        const rows = await call('GET', q);
        if (!Array.isArray(rows) || rows.length === 0) break;
        out.push(...rows);
        if (rows.length < pageSize) break;
      }
      return out;
    },
    insert(table, rows, returnRep = false) {
      return call('POST', `/${table}`, {
        body: rows,
        prefer: returnRep ? 'return=representation' : 'return=minimal'
      });
    },
    upsert(table, rows, onConflict, returnRep = false) {
      return call('POST', `/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        body: rows,
        prefer: `resolution=merge-duplicates,${returnRep ? 'return=representation' : 'return=minimal'}`
      });
    },
    patch(table, query, body) {
      return call('PATCH', `/${table}?${query}`, { body, prefer: 'return=minimal' });
    }
  };
}

/* ─────────────────────────── حساب أيام الدراسة ─────────────────────────── */

const MS_DAY = 86400000;
const toUTC = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtDate = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};
const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * هل اليوم راحة أسبوعية لهذا الصف/التخصص؟
 * (منقول عن منطق السستم: متى ذُكر التخصص في القاعدة كان هو الفيصل)
 */
function isWeeklyOff(dow, weeklyOff, studyYear, specId) {
  return weeklyOff.some((w) => {
    if (Number(w.weekday) !== dow) return false;
    if (w.spec_id != null) return Number(w.spec_id) === Number(specId);
    return w.study_year == null || Number(w.study_year) === Number(studyYear);
  });
}

/**
 * يحسب عدد أيام الدراسة الفعلية لكل توليفة (صف + تخصص) بين تاريخين.
 * يعيد دالة تأخذ (studyYear, specId) وتعيد العدد — مع تخزين مؤقت للنتائج.
 */
function makeSchoolDaysCounter(from, to, holidaySet, weeklyOff, cfg) {
  const days = [];
  for (let t = toUTC(from), end = toUTC(to); t <= end; t += MS_DAY) {
    const ds = fmtDate(t);
    if (holidaySet.has(ds)) continue;                       // إجازة من التقويم
    const dow = new Date(t).getUTCDay();                    // 0=الأحد .. 6=السبت
    if (cfg.excludeFriday && dow === 5) continue;           // الجمعة ليست يوم دراسة
    days.push(dow);
  }
  const cache = new Map();
  return (studyYear, specId) => {
    const key = `${studyYear}|${specId}`;
    if (cache.has(key)) return cache.get(key);
    let n = 0;
    for (const dow of days) if (!isWeeklyOff(dow, weeklyOff, studyYear, specId)) n++;
    cache.set(key, n);
    return n;
  };
}

/* ───────────────────────────────── المزامنة ────────────────────────────── */

async function main() {
  say('════════════════════════════════════════════════════════');
  say('   مزامنة الطلاب والغياب — من «السستم» إلى المنصة');
  say(`   التاريخ: ${stamp()}${DRY_RUN ? '   [وضع تجريبي — بلا كتابة]' : ''}`);
  say('════════════════════════════════════════════════════════');

  const cfg = loadConfig();
  const { url, key, publicKey } = loadCredentials();
  assertSecretKey(key, publicKey);

  let remote = null;
  if (url && key) {
    remote = makeClient(url, key);
    say(`الاتصال بالمنصة: ${url}`);
  } else if (DRY_RUN) {
    warn('لا يوجد SUPABASE_SERVICE_KEY — سيعمل الوضع التجريبي على القراءة والحساب فقط بلا اتصال بالمنصة.');
    say('تنبيه: لم يُعثر على مفتاح الخدمة، وسيقتصر التشغيل التجريبي على قراءة قاعدة السستم.');
  } else {
    throw new Error(
      'لم يُعثر على SUPABASE_URL أو SUPABASE_SERVICE_KEY.\n' +
      'أنشئ ملف tools/.env.sync بالمحتوى التالي:\n' +
      '  SUPABASE_URL=https://xxxx.supabase.co\n' +
      '  SUPABASE_SERVICE_KEY=<مفتاح service_role>\n' +
      'المفتاح من: Supabase ▸ Project Settings ▸ API Keys ▸ Secret keys ▸ default'
    );
  }

  /* ── ١) فتح قاعدة السستم ── */
  say(`\n[١] فتح قاعدة بيانات السستم…`);
  detail(`المسار: ${cfg.schoolSystemPath}`);
  const db = await openDatabase(cfg.schoolSystemPath);
  say(`    ✔ تم الفتح عبر ${db.driver}`);

  /* ── ٢) السنة الدراسية ── */
  const year = cfg.academicYear === 'active'
    ? db.get('SELECT * FROM academic_years WHERE is_active=1 ORDER BY id DESC LIMIT 1')
    : db.get('SELECT * FROM academic_years WHERE name=?', String(cfg.academicYear));
  if (!year) {
    throw new Error(
      cfg.academicYear === 'active'
        ? 'لا توجد سنة دراسية نشطة في السستم (academic_years.is_active=1). فعِّل سنة من إعدادات السستم.'
        : `لا توجد سنة دراسية باسم «${cfg.academicYear}» في السستم.`
    );
  }
  const academicYear = year.name;
  const rangeFrom = String(year.start_date).slice(0, 10);
  const today = todayStr();
  const rangeTo = today < String(year.end_date).slice(0, 10) ? today : String(year.end_date).slice(0, 10);
  say(`[٢] السنة الدراسية: ${academicYear}  (من ${rangeFrom} حتى ${rangeTo})`);

  /* ── ٣) قراءة بيانات السستم ── */
  const sysSpecs = db.all('SELECT id,name,study_year,code FROM specializations');
  const specById = new Map(sysSpecs.map((s) => [Number(s.id), s]));

  const statusList = (cfg.includeStudentStatuses || ['active']).map((s) => String(s));
  const placeholders = statusList.map(() => '?').join(',');
  const sysStudents = db.all(
    `SELECT id, file_number, national_id, seat_number, full_name, guardian_name, guardian_phone,
            phone, year_id, study_year, specialization_id, class_name, status
       FROM students
      WHERE year_id = ? AND status IN (${placeholders})`,
    Number(year.id), ...statusList
  );
  say(`[٣] طلاب السستم المطابقون للحالات [${statusList.join(', ')}]: ${sysStudents.length}`);

  const sysAttendance = db.all(
    `SELECT a.student_id, a.day_date, a.status, a.note
       FROM attendance a
       JOIN students s ON s.id = a.student_id
      WHERE s.year_id = ? AND a.day_date BETWEEN ? AND ?`,
    Number(year.id), rangeFrom, rangeTo
  );
  say(`    سجلات الغياب/الحضور المقروءة: ${sysAttendance.length}`);
  if (sysAttendance.length === 0) {
    warn('جدول attendance في السستم لا يحتوي أي سجل لهذه السنة — لن تُرفع سجلات غياب (وهذا طبيعي قبل بدء التسجيل اليومي).');
  }

  const holidayRows = db.all('SELECT day_date, day_type FROM calendar_days WHERE year_id=?', Number(year.id));
  const excludeTypes = new Set((cfg.excludeCalendarDayTypes || []).map(String));
  const holidaySet = new Set(
    holidayRows.filter((r) => excludeTypes.has(String(r.day_type))).map((r) => String(r.day_date).slice(0, 10))
  );
  const weeklyOff = db.all('SELECT study_year, spec_id, weekday FROM weekly_off_days WHERE year_id=?', Number(year.id));
  detail(`أيام تقويم مستبعَدة: ${holidaySet.size} / ${holidayRows.length} — قواعد راحة أسبوعية: ${weeklyOff.length}`);

  const countSchoolDays = makeSchoolDaysCounter(rangeFrom, rangeTo, holidaySet, weeklyOff, cfg);

  /* ── ٤) الوضع التجريبي بلا اتصال: تقرير قراءة فقط ── */
  if (!remote) {
    const sampleDays = countSchoolDays(1, null);
    say(`\n[٤] لا اتصال بالمنصة — تقرير القراءة فقط:`);
    say(`    أيام الدراسة الفعلية حتى اليوم (صف ١ بلا تخصص): ${sampleDays}`);
    say(`    تخصصات السستم: ${sysSpecs.length}`);
    const noKey = sysStudents.filter((s) => !cleanNid(s.national_id) && !cleanText(s.file_number) && !cleanText(s.seat_number)).length;
    say(`    طلاب بلا رقم قومي ولا رقم ملف ولا رقم جلوس (سيُتخطّون): ${noKey}`);
    db.close();
    printSummary({ studentsInserted: 0, studentsUpdated: 0, studentsSkipped: noKey, attendanceUpserted: 0, summariesUpserted: 0, unmatchedSpecs: [] });
    return 0;
  }

  /* ── ٥) جلب بيانات المنصة ── */
  say('\n[٤] قراءة بيانات المنصة الحالية…');
  const [platSpecs, platStudents, platGrades] = await Promise.all([
    remote.selectAll('specializations', 'id,slug,name'),
    remote.selectAll('students', 'id,student_code,national_id'),
    remote.selectAll('grades', 'id,name')
  ]);
  say(`    تخصصات المنصة: ${platSpecs.length} — طلاب مسجّلون حاليًا: ${platStudents.length} — صفوف: ${platGrades.length}`);

  /* ── ٦) مطابقة التخصصات ── */
  const byExact = new Map();
  const byLoose = new Map();
  for (const s of platSpecs) {
    byExact.set(normalizeAr(s.name), s);
    byExact.set(normalizeAr(s.slug), s);
    const loose = loosenAr(s.name);
    if (!byLoose.has(loose)) byLoose.set(loose, []);
    byLoose.get(loose).push(s);
  }
  const aliasNorm = new Map(
    Object.entries(cfg.specializationAliases || {}).map(([k, v]) => [normalizeAr(k), normalizeAr(v)])
  );

  const specMatch = new Map();   // sysSpecId → platform uuid | null
  const unmatchedSpecs = new Set();
  for (const s of sysSpecs) {
    const sysName = String(s.name || '');
    let hit = null;
    const alias = aliasNorm.get(normalizeAr(sysName));
    if (alias) hit = byExact.get(alias) || null;
    if (!hit) hit = byExact.get(normalizeAr(sysName)) || null;
    if (!hit) {
      const loose = loosenAr(sysName);
      const exactLoose = byLoose.get(loose);
      if (exactLoose && exactLoose.length === 1) hit = exactLoose[0];
    }
    if (!hit) {
      /* مطابقة احتوائية: تُقبل فقط إن كانت وحيدة وغير ملتبسة */
      const loose = loosenAr(sysName);
      const cands = platSpecs.filter((p) => {
        const pl = loosenAr(p.name);
        return pl && loose && (pl.includes(loose) || loose.includes(pl));
      });
      if (cands.length === 1) hit = cands[0];
    }
    if (hit) {
      specMatch.set(Number(s.id), hit.id);
      detail(`تخصص مطابَق: «${sysName}» (صف ${s.study_year}) → «${hit.name}»`);
    } else {
      specMatch.set(Number(s.id), null);
      unmatchedSpecs.add(sysName);
    }
  }
  for (const n of unmatchedSpecs) {
    warn(`تخصص «${n}» لا يقابله تخصص في المنصة — سيُترك حقل التخصص فارغًا للطلاب التابعين له.`);
  }
  const matchedCount = [...specMatch.values()].filter(Boolean).length;
  say(`[٥] التخصصات: مطابَقة ${matchedCount} / ${sysSpecs.length} — غير مطابَقة بالاسم: ${unmatchedSpecs.size}`);
  if (unmatchedSpecs.size) say('    ↳ أضف مرادفاتها في "specializationAliases" داخل tools/sync.config.json أو أنشئها في لوحة الإدارة.');

  /* ── ٧) إنشاء سجل الدفعة ── */
  let batchId = null;
  if (!DRY_RUN) {
    const created = await remote.insert('import_batches', [{
      file_name: 'SchoolSystem',
      kind: 'attendance_sync',
      rows_total: sysStudents.length + sysAttendance.length,
      rows_inserted: 0, rows_updated: 0, rows_failed: 0
    }], true);
    batchId = Array.isArray(created) && created[0] ? created[0].id : null;
    detail(`معرّف الدفعة: ${batchId}`);
  }

  /* ── ٨) رفع الطلاب ── */
  const byNid = new Map();
  const byCode = new Map();
  for (const p of platStudents) {
    if (p.national_id) byNid.set(String(p.national_id), p);
    if (p.student_code) byCode.set(String(p.student_code), p);
  }

  let studentsInserted = 0, studentsUpdated = 0, studentsSkipped = 0;
  const studentIdByLocal = new Map();   // system student id → platform uuid

  if (cfg.syncStudents) {
    say('\n[٦] مزامنة الطلاب…');
    const toInsert = [];
    const toPatch = [];

    for (const s of sysStudents) {
      const nid = cleanNid(s.national_id);
      const fileNo = cleanText(s.file_number);
      const seatNo = cleanText(s.seat_number);
      if (!nid && !fileNo && !seatNo) {
        studentsSkipped++;
        fail(`طالب بلا رقم قومي ولا رقم ملف: «${s.full_name}» (id=${s.id}) — تم تخطّيه.`);
        continue;
      }
      const studentCode = fileNo || seatNo || (nid ? `NID-${nid}` : null);
      const spec = s.specialization_id != null ? specById.get(Number(s.specialization_id)) : null;
      const specUuid = spec ? (specMatch.get(Number(spec.id)) || null) : null;
      const gradeId = [1, 2, 3].includes(Number(s.study_year)) ? Number(s.study_year) : null;

      const payload = {
        student_code: studentCode,
        national_id: nid,
        full_name: cleanText(s.full_name) || '—',
        grade_id: gradeId,
        specialization_id: specUuid,
        guardian_name: cleanText(s.guardian_name),
        guardian_phone: cleanText(s.guardian_phone) || cleanText(s.phone),
        academic_year: academicYear,
        status: cleanText(s.status) || 'active'
      };

      /* المطابقة: الرقم القومي أولًا ثم رقم الملف */
      const existing = (nid && byNid.get(nid)) || byCode.get(String(studentCode)) || null;
      if (existing) {
        /* حماية من تعارض القيود الفريدة: لا نغيّر رقم ملف يخصّ طالبًا آخر */
        const codeOwner = byCode.get(String(studentCode));
        if (codeOwner && codeOwner.id !== existing.id) {
          delete payload.student_code;
          warn(`رقم الملف «${studentCode}» مستخدم لطالب آخر في المنصة — حُدِّث الطالب «${s.full_name}» دون تغيير رقم ملفه.`);
        }
        const nidOwner = nid ? byNid.get(nid) : null;
        if (nidOwner && nidOwner.id !== existing.id) delete payload.national_id;
        toPatch.push({ id: existing.id, payload, local: Number(s.id) });
        studentIdByLocal.set(Number(s.id), existing.id);
      } else {
        toInsert.push({ payload, local: Number(s.id) });
      }
    }

    say(`    للإضافة: ${toInsert.length} — للتحديث: ${toPatch.length} — متخطّى: ${studentsSkipped}`);

    if (!DRY_RUN) {
      /* الإضافة على دفعات مع upsert احتياطي على student_code */
      const size = Number(cfg.batchSize) || 500;
      for (let i = 0; i < toInsert.length; i += size) {
        const chunk = toInsert.slice(i, i + size);
        try {
          const rows = await remote.upsert('students', chunk.map((c) => c.payload), 'student_code', true);
          const map = new Map((rows || []).map((r) => [String(r.student_code), r.id]));
          for (const c of chunk) {
            const id = map.get(String(c.payload.student_code));
            if (id) studentIdByLocal.set(c.local, id);
          }
          studentsInserted += chunk.length;
        } catch (e) {
          /* عند فشل الدفعة (تعارض رقم قومي مثلًا) نعيد المحاولة صفًّا صفًّا */
          for (const c of chunk) {
            try {
              const rows = await remote.upsert('students', [c.payload], 'student_code', true);
              if (rows && rows[0]) studentIdByLocal.set(c.local, rows[0].id);
              studentsInserted++;
            } catch (e2) {
              fail(`فشل إضافة الطالب «${c.payload.full_name}» (${c.payload.student_code}): ${e2.message}`);
            }
          }
          detail(`أُعيدت دفعة إضافة صفًّا صفًّا بسبب: ${e.message}`);
        }
      }

      for (const t of toPatch) {
        try {
          await remote.patch('students', `id=eq.${t.id}`, t.payload);
          studentsUpdated++;
        } catch (e) {
          fail(`فشل تحديث الطالب «${t.payload.full_name}»: ${e.message}`);
        }
      }
    } else {
      studentsInserted = toInsert.length;
      studentsUpdated = toPatch.length;
      for (const t of toPatch) studentIdByLocal.set(t.local, t.id);
    }
    say(`    ✔ مضاف: ${studentsInserted} — محدَّث: ${studentsUpdated}`);
  } else {
    say('\n[٦] مزامنة الطلاب معطّلة في الإعدادات (syncStudents=false) — يُعتمد على الطلاب الموجودين.');
    for (const s of sysStudents) {
      const nid = cleanNid(s.national_id);
      const code = cleanText(s.file_number) || cleanText(s.seat_number) || (nid ? `NID-${nid}` : null);
      const ex = (nid && byNid.get(nid)) || (code && byCode.get(String(code)));
      if (ex) studentIdByLocal.set(Number(s.id), ex.id);
    }
  }

  /* ── ٩) رفع سجلات الغياب (غير الحاضرين فقط) ── */
  say('\n[٧] مزامنة سجلات الغياب…');
  const statusMap = cfg.statusMap;
  const attRows = [];
  let attSkipped = 0;
  for (const a of sysAttendance) {
    if (String(a.status) === 'present') continue;         // الحاضر لا يُرفع توفيرًا للحجم
    const uuid = studentIdByLocal.get(Number(a.student_id));
    if (!uuid) { attSkipped++; continue; }
    const mapped = statusMap[String(a.status)];
    if (!mapped) { attSkipped++; fail(`حالة غياب غير معروفة «${a.status}» — تم تخطّي السجل.`); continue; }
    attRows.push({
      student_id: uuid,
      date: String(a.day_date).slice(0, 10),
      status: mapped,
      section: null,
      reason: cleanText(a.note),
      import_id: batchId
    });
  }
  say(`    سجلات للرفع: ${attRows.length}${attSkipped ? ` — متخطّاة: ${attSkipped}` : ''}`);

  let attendanceUpserted = 0;
  if (!DRY_RUN && attRows.length) {
    const size = Number(cfg.batchSize) || 500;
    for (let i = 0; i < attRows.length; i += size) {
      const chunk = attRows.slice(i, i + size);
      try {
        await remote.upsert('attendance_records', chunk, 'student_id,date,section');
        attendanceUpserted += chunk.length;
        detail(`رُفعت دفعة غياب ${i / size + 1}: ${chunk.length} صف`);
      } catch (e) {
        fail(`فشل رفع دفعة غياب (${chunk.length} صف): ${e.message}`);
      }
    }
  } else if (DRY_RUN) {
    attendanceUpserted = attRows.length;
  }
  if (attendanceUpserted) say(`    ✔ سجلات مرفوعة: ${attendanceUpserted}`);

  /* ── ١٠) ملخّص الحضور ── */
  say('\n[٨] حساب ملخّص الحضور…');
  const perStudent = new Map();   // system id → { absence, excused }
  for (const a of sysAttendance) {
    const st = String(a.status);
    if (st === 'present') continue;
    const rec = perStudent.get(Number(a.student_id)) || { absence: 0, excused: 0 };
    if (st === 'absent' || st === 'loss') rec.absence++;
    else if (st === 'sick' || st === 'excused') rec.excused++;
    perStudent.set(Number(a.student_id), rec);
  }

  const summaries = [];
  for (const s of sysStudents) {
    const uuid = studentIdByLocal.get(Number(s.id));
    if (!uuid) continue;
    const total = countSchoolDays(Number(s.study_year), s.specialization_id != null ? Number(s.specialization_id) : null);
    const rec = perStudent.get(Number(s.id)) || { absence: 0, excused: 0 };
    const absence = rec.absence;
    const attend = Math.max(0, total - absence - rec.excused);
    const pct = (n) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
    summaries.push({
      student_id: uuid,
      academic_year: academicYear,
      total_school_days: total,
      attendance_days: attend,
      absence_days: absence,
      attendance_pct: pct(attend),
      absence_pct: pct(absence),
      last_updated: new Date().toISOString()
    });
  }
  say(`    ملخّصات محسوبة: ${summaries.length}`);

  let summariesUpserted = 0;
  if (!DRY_RUN && summaries.length) {
    const size = Number(cfg.batchSize) || 500;
    for (let i = 0; i < summaries.length; i += size) {
      const chunk = summaries.slice(i, i + size);
      try {
        await remote.upsert('attendance_summaries', chunk, 'student_id');
        summariesUpserted += chunk.length;
      } catch (e) {
        fail(`فشل رفع دفعة ملخّصات (${chunk.length} صف): ${e.message}`);
      }
    }
  } else if (DRY_RUN) {
    summariesUpserted = summaries.length;
  }
  if (summariesUpserted) say(`    ✔ ملخّصات مرفوعة: ${summariesUpserted}`);

  /* ── ١١) إغلاق سجل الدفعة ── */
  if (!DRY_RUN && batchId) {
    try {
      await remote.patch('import_batches', `id=eq.${batchId}`, {
        rows_total: sysStudents.length + attRows.length,
        rows_inserted: studentsInserted + attendanceUpserted,
        rows_updated: studentsUpdated + summariesUpserted,
        rows_failed: ERRORS.length,
        errors: [...ERRORS.map((m) => ({ type: 'error', message: m })),
                 ...WARNINGS.map((m) => ({ type: 'warning', message: m }))].slice(0, 200)
      });
    } catch (e) {
      fail(`تعذّر تحديث سجل الدفعة: ${e.message}`);
    }
  }

  db.close();
  printSummary({
    studentsInserted, studentsUpdated, studentsSkipped,
    attendanceUpserted, summariesUpserted,
    unmatchedSpecs: [...unmatchedSpecs]
  });
  return ERRORS.length ? 1 : 0;
}

function printSummary(r) {
  say('\n────────────────────── التقرير النهائي ──────────────────────');
  if (DRY_RUN) say('  ⓘ وضع تجريبي: لم تُكتب أي بيانات على المنصة.');
  say(`  الطلاب المضافون   : ${r.studentsInserted}`);
  say(`  الطلاب المحدَّثون  : ${r.studentsUpdated}`);
  say(`  الطلاب المتخطَّون  : ${r.studentsSkipped}`);
  say(`  سجلات الغياب      : ${r.attendanceUpserted}`);
  say(`  ملخّصات الحضور     : ${r.summariesUpserted}`);
  say(`  تخصصات غير مطابقة : ${r.unmatchedSpecs.length}${r.unmatchedSpecs.length ? ' → ' + r.unmatchedSpecs.join('، ') : ''}`);
  say(`  التحذيرات         : ${WARNINGS.length}`);
  say(`  الأخطاء           : ${ERRORS.length}`);
  if (WARNINGS.length) {
    say('\n  تفاصيل التحذيرات:');
    for (const w of WARNINGS.slice(0, 20)) say(`   ⚠ ${w}`);
    if (WARNINGS.length > 20) say(`   … و${WARNINGS.length - 20} تحذيرًا آخر (انظر ملف السجل).`);
  }
  if (ERRORS.length) {
    say('\n  تفاصيل الأخطاء:');
    for (const e of ERRORS.slice(0, 20)) say(`   ✖ ${e}`);
    if (ERRORS.length > 20) say(`   … و${ERRORS.length - 20} خطأً آخر (انظر ملف السجل).`);
  }
  say('─────────────────────────────────────────────────────────────');
}

/* ─────────────────────────────── نقطة الدخول ───────────────────────────── */

main()
  .then((code) => {
    flushLog();
    process.exit(code || 0);
  })
  .catch((err) => {
    say('\n✖ توقفت المزامنة بسبب خطأ:');
    say(String(err && err.message ? err.message : err));
    if (VERBOSE && err && err.stack) LOG_LINES.push(err.stack);
    ERRORS.push(String(err && err.message ? err.message : err));
    flushLog();
    process.exit(1);
  });
