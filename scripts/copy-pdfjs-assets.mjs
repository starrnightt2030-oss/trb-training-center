/**
 * نسخ موارد PDF.js إلى مجلد public قبل البناء والتشغيل.
 *
 * لماذا؟ الكتب العربية تستخدم خطوطاً مدمجة بترميز CID، و PDF.js يحتاج
 * ملفات cMaps ليفكّ هذا الترميز، ويحتاج الخطوط القياسية (standard_fonts)
 * حين لا يكون الخط مدمجاً في الملف. بدون هذين المجلدين تظهر الحروف
 * العربية متفرّقة أو مقلوبة أو مربّعات فارغة — وهي المشكلة التي كانت
 * تظهر عند فتح الكتب المرفوعة.
 *
 * تُنسخ الموارد محلياً (لا من CDN) حتى يعمل الموقع بلا اعتماد خارجي.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = path.join(root, 'node_modules', 'pdfjs-dist');
const dest = path.join(root, 'public', 'pdfjs');

const PARTS = ['cmaps', 'standard_fonts'];

async function main() {
  if (!existsSync(src)) {
    console.warn('⚠ لم يُعثر على pdfjs-dist داخل node_modules — تخطّي نسخ موارد عارض الكتب.');
    return;
  }

  for (const part of PARTS) {
    const from = path.join(src, part);
    const to   = path.join(dest, part);
    if (!existsSync(from)) {
      console.warn(`⚠ المجلد ${part} غير موجود في pdfjs-dist — تخطّيه.`);
      continue;
    }
    await rm(to, { recursive: true, force: true });
    await mkdir(to, { recursive: true });
    await cp(from, to, { recursive: true });
    const s = await stat(to);
    if (!s.isDirectory()) throw new Error(`فشل نسخ ${part}`);
    console.log(`✔ نُسخت موارد PDF.js: ${part}`);
  }
}

main().catch((e) => {
  console.error('✖ تعذّر نسخ موارد PDF.js:', e?.message ?? e);
  process.exitCode = 1;
});
