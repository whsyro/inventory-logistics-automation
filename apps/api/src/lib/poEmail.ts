// HTML builders for the supplier order email and the public confirmation pages.

export interface PoEmailItem {
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export interface PoEmailData {
  number: string;
  supplierName: string;
  expectedAt?: Date | string | null;
  notes?: string | null;
  warehouseName?: string | null;
  items: PoEmailItem[];
}

const money = (n: number) =>
  '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString() : 'not specified';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemRows(items: PoEmailItem[]): string {
  return items
    .map(
      (i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(i.name)}
            <span style="color:#94a3b8;font-size:12px">${esc(i.sku)}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${money(i.unitCost)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${money(i.quantity * i.unitCost)}</td>
        </tr>`,
    )
    .join('');
}

function itemsTable(data: PoEmailData): string {
  const total = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
      <thead>
        <tr style="text-align:left;color:#64748b">
          <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0">Product</th>
          <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Qty</th>
          <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Unit cost</th>
          <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows(data.items)}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:10px 12px;text-align:right;font-weight:600">Total</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700">${money(total)}</td>
        </tr>
      </tfoot>
    </table>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title></head>
    <body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;padding:24px">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          ${body}
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">Sent by ILA — Inventory &amp; Logistics Automation</p>
      </div>
    </body></html>`;
}

/** The order email sent to the supplier. confirmUrl is the landing page (GET). */
export function buildOrderEmail(data: PoEmailData, confirmUrl: string) {
  const button = (label: string, href: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;

  const body = `
    <h1 style="font-size:20px;margin:0 0 4px">New purchase order ${esc(data.number)}</h1>
    <p style="color:#64748b;margin:0 0 16px">Hello ${esc(data.supplierName)}, please review and respond to the order below.</p>
    <p style="font-size:14px;margin:0 0 4px"><strong>Expected by:</strong> ${fmtDate(data.expectedAt)}</p>
    ${data.warehouseName ? `<p style="font-size:14px;margin:0 0 4px"><strong>Deliver to:</strong> ${esc(data.warehouseName)}</p>` : ''}
    ${data.notes ? `<p style="font-size:14px;margin:0 0 4px"><strong>Notes:</strong> ${esc(data.notes)}</p>` : ''}
    ${itemsTable(data)}
    <div style="margin-top:24px;text-align:center">
      ${button('✓ Confirm order', `${confirmUrl}?intent=confirm`, '#16a34a')}
      &nbsp;&nbsp;
      ${button('✕ Decline', `${confirmUrl}?intent=decline`, '#dc2626')}
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px;text-align:center">Clicking a button opens a confirmation page — your response is recorded only after you confirm there.</p>`;

  return {
    subject: `Purchase order ${data.number} from ILA`,
    html: shell(`Order ${data.number}`, body),
    text:
      `New purchase order ${data.number}\n` +
      `Expected by: ${fmtDate(data.expectedAt)}\n\n` +
      data.items.map((i) => `- ${i.name} (${i.sku}) x${i.quantity} @ ${money(i.unitCost)}`).join('\n') +
      `\n\nReview & respond: ${confirmUrl}`,
  };
}

/** Landing page the supplier sees after clicking a link (GET; no state change). */
export function confirmLandingPage(data: PoEmailData, token: string, intent?: string): string {
  const action = `/api/purchase-orders/confirm/${token}`;
  const formBtn = (label: string, decision: string, bg: string) =>
    `<form method="post" action="${action}" style="display:inline">
       <input type="hidden" name="decision" value="${decision}" />
       <button type="submit" style="padding:12px 22px;border:none;border-radius:8px;background:${bg};color:#fff;font-weight:600;font-size:15px;cursor:pointer">${label}</button>
     </form>`;

  const hint =
    intent === 'decline'
      ? 'You chose to decline. Confirm your response below.'
      : intent === 'confirm'
        ? 'You chose to confirm. Confirm your response below.'
        : 'Please confirm or decline this order below.';

  const body = `
    <h1 style="font-size:20px;margin:0 0 4px">Purchase order ${esc(data.number)}</h1>
    <p style="color:#64748b;margin:0 0 16px">${esc(hint)}</p>
    ${itemsTable(data)}
    <div style="margin-top:24px;display:flex;gap:12px;justify-content:center">
      ${formBtn('✓ Confirm this order', 'confirm', '#16a34a')}
      ${formBtn('✕ Decline', 'decline', '#dc2626')}
    </div>`;
  return shell(`Respond to ${data.number}`, body);
}

/** Result page shown after the supplier responds. */
export function confirmResultPage(opts: { title: string; message: string; tone: 'green' | 'red' | 'gray' }): string {
  const color = { green: '#16a34a', red: '#dc2626', gray: '#64748b' }[opts.tone];
  const body = `
    <div style="text-align:center">
      <div style="font-size:40px">${opts.tone === 'green' ? '✅' : opts.tone === 'red' ? '🚫' : 'ℹ️'}</div>
      <h1 style="font-size:20px;margin:12px 0 4px;color:${color}">${esc(opts.title)}</h1>
      <p style="color:#64748b;margin:0">${esc(opts.message)}</p>
    </div>`;
  return shell(opts.title, body);
}
