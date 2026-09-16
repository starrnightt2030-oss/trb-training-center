/**
 * توليد عامل الخدمة ببصمة بناء جديدة في كل مرّة.
 *
 * لماذا؟ المتصفح لا يُحدِّث عامل الخدمة إلا إذا اختلفت بايتات ملفه. وملف
 * ثابت لا يتغيّر بين النشرات يعني أن العامل القديم يظل يعمل ويقدّم صفحة
 * محفوظة تشير إلى حزم جافاسكربت حُذفت في النشرة الجديدة — فيظهر للمستخدم
 *   TypeError: Failed to fetch dynamically imported module
 * وهو بالضبط ما حدث. بحقن بصمة جديدة تتغيّر بايتات الملف، فيكتشف المتصفح
 * التحديث، ويُفعِّل النسخة الجديدة، ويمسح مخازن الإصدار السابق.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const src = await readFile(path.join(root, 'scripts', 'sw.template.js'), 'utf8');
const out = src.replace('__BUILD_STAMP__', stamp);
if (out === src) {
  console.warn('⚠ لم يُعثر على علامة البصمة داخل قالب عامل الخدمة.');
}
await writeFile(path.join(root, 'public', 'sw.js'), out, 'utf8');
console.log(`✔ وُلِّد عامل الخدمة ببصمة: ${stamp}`);
