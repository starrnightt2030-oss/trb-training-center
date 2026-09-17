import { digitsOnly } from './format';

export interface WhatsAppContext {
  ticketId: string;
  type: string;
  name: string;
  center: string;
  subject?: string;
}

/** استبدال المتغيّرات داخل قالب الرسالة المحفوظ بالإعدادات */
export function renderTemplate(template: string, ctx: WhatsAppContext): string {
  return template
    .replace(/\{\{\s*TICKET_ID\s*\}\}/g, ctx.ticketId)
    .replace(/\{\{\s*TYPE\s*\}\}/g, ctx.type)
    .replace(/\{\{\s*NAME\s*\}\}/g, ctx.name)
    .replace(/\{\{\s*CENTER\s*\}\}/g, ctx.center)
    .replace(/\{\{\s*SUBJECT\s*\}\}/g, ctx.subject ?? '');
}

/**
 * تنظيف وتنسيق رقم واتساب بالصيغة الدولية المتوافقة مع رابط wa.me
 * يتعامل تلقائياً وبذكاء مع الأرقام المصرية بجميع صيغها:
 * - 01552225105  -> 201552225105 (إضافة كود مصر وحذف الصفر المحلي)
 * - +201552225105 -> 201552225105
 * - 00201552225105 -> 201552225105
 * - 2001552225105 -> 201552225105 (حذف الصفر الزائد بعد كود الدولة)
 * - 1552225105 -> 201552225105
 */
export function normalizeWhatsAppNumber(number: string): string {
  if (!number) return '';
  let n = digitsOnly(number);
  if (!n) return '';

  // حذف أصفار الاتصال الدولي المزدوجة من البداية 00
  while (n.startsWith('00')) {
    n = n.slice(2);
  }

  // كود مصر 20 متبوعاً بصفر المحمول 01 (13 رقم، مثل 20015...)
  if (/^2001[0125]\d{8}$/.test(n)) {
    n = '20' + n.slice(3);
  }
  // رقم محمول مصري محلي يبدأ بـ 01 (11 رقم، مثل 0155...)
  else if (/^01[0125]\d{8}$/.test(n)) {
    n = '20' + n.slice(1);
  }
  // رقم محمول مصري بدون 0 وبدون 20 (10 أرقام، مثل 155...)
  else if (/^1[0125]\d{8}$/.test(n)) {
    n = '20' + n;
  }
  // خط أرضي إسكندرية 03 أو القاهرة 02
  else if (/^0[23]\d{7,8}$/.test(n)) {
    n = '20' + n.slice(1);
  }

  return n;
}

/**
 * رابط WhatsApp Click-to-Chat المجاني (wa.me).
 * لا يعتمد على أي واجهة برمجية مدفوعة.
 */
export function buildWhatsAppLink(number: string, message: string): string | null {
  const n = normalizeWhatsAppNumber(number ?? '');
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}
