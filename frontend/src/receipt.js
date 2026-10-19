import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt) ? d : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const buildReceiptHTML = (r) => {
  const cur = r.hotel.currency || "LKR";
  const m = (n) => `${cur} ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const t = r.totals;
  const contactLine = [r.hotel.hotel_phone, r.hotel.hotel_contact].filter(Boolean).join(" / ");

  const orderRows = r.restaurant_orders.flatMap((o) =>
    o.items.map((i, idx) => `<tr>
      <td>${idx === 0 ? `${fmtDate(o.date)}<div class="muted">#${esc(o.order_number)}</div>` : ""}</td>
      <td>${esc(i.name)}</td><td class="c">${i.quantity}</td><td class="r">${m(i.unit_price)}</td><td class="r">${m(i.total)}</td></tr>`)
  ).join("");

  const paymentRows = [
    ...r.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.description)}</td><td>${esc(p.method || "-")}</td><td class="r">${m(p.amount)}</td></tr>`),
    t.balance_settled > 0 ? `<tr><td>${fmtDate(r.stay.check_out_date)}</td><td>Balance settled at check-out</td><td>${esc(t.settlement_method || "-")}</td><td class="r">${m(t.balance_settled)}</td></tr>` : "",
  ].join("");

  const taxRows = (t.tax_breakdown || []).length
    ? t.tax_breakdown.map((x) => `<tr><td>${esc(x.name)}${x.type === "percentage" ? ` (${x.rate}%)` : ""}</td><td class="r">${m(x.amount)}</td></tr>`).join("")
    : t.taxes > 0 ? `<tr><td>Taxes &amp; Levies</td><td class="r">${m(t.taxes)}</td></tr>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${esc(r.receipt_number)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; font-size: 11.5px; line-height: 1.45; }
  .page { width: 182mm; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1464; padding-bottom: 12px; }
  .brand { display: flex; gap: 14px; align-items: center; }
  .brand img { max-height: 64px; max-width: 120px; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 22px; color: #1a1464; letter-spacing: .3px; }
  .brand p { margin: 2px 0 0; color: #4b5563; font-size: 11px; }
  .doc { text-align: right; }
  .doc h2 { margin: 0; font-size: 18px; letter-spacing: 3px; color: #e41e2e; }
  .doc p { margin: 3px 0 0; font-size: 11px; color: #4b5563; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; }
  .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
  .box h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; }
  .kv { display: flex; justify-content: space-between; padding: 1px 0; }
  .kv span:first-child { color: #6b7280; }
  h4 { margin: 18px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #1a1464; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #374151; padding: 6px 8px; border-bottom: 1px solid #d1d5db; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .r { text-align: right; } .c { text-align: center; } .muted { color: #9ca3af; font-size: 10px; }
  .totals { width: 52%; margin-left: auto; margin-top: 14px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals .sep td { border-top: 1px solid #d1d5db; }
  .totals .grand td { font-size: 14px; font-weight: 700; color: #1a1464; border-top: 2px solid #1a1464; padding-top: 8px; }
  .totals .bal td { font-weight: 700; background: #f9fafb; }
  .foot { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sig { width: 200px; border-top: 1px solid #9ca3af; text-align: center; padding-top: 4px; font-size: 10px; color: #6b7280; }
  .thanks { text-align: center; margin-top: 26px; color: #6b7280; font-size: 11px; border-top: 1px dashed #d1d5db; padding-top: 10px; }
  tr { page-break-inside: avoid; }
</style></head><body><div class="page">
  <div class="head">
    <div class="brand">
      ${r.hotel.hotel_logo ? `<img src="${r.hotel.hotel_logo}" alt="logo"/>` : ""}
      <div>
        <h1>${esc(r.hotel.hotel_name)}</h1>
        ${r.hotel.hotel_address ? `<p>${esc(r.hotel.hotel_address)}</p>` : ""}
        ${contactLine ? `<p>Tel: ${esc(contactLine)}</p>` : ""}
        ${r.hotel.hotel_email ? `<p>${esc(r.hotel.hotel_email)}</p>` : ""}
      </div>
    </div>
    <div class="doc">
      <h2>RECEIPT</h2>
      <p><strong>No:</strong> ${esc(r.receipt_number)}</p>
      <p><strong>Issued:</strong> ${esc(r.issued_at)}</p>
    </div>
  </div>

  <div class="grid">
    <div class="box"><h3>Guest</h3>
      <div class="kv"><span>Name</span><strong>${esc(r.guest.name)}</strong></div>
      <div class="kv"><span>Phone</span><span>${esc(r.guest.phone || "-")}</span></div>
      <div class="kv"><span>Email</span><span>${esc(r.guest.email || "-")}</span></div>
    </div>
    <div class="box"><h3>Stay</h3>
      <div class="kv"><span>Room</span><strong>${esc(r.stay.room_number)}</strong></div>
      <div class="kv"><span>Check-in</span><span>${fmtDate(r.stay.check_in_date)}</span></div>
      <div class="kv"><span>Check-out</span><span>${fmtDate(r.stay.check_out_date)}</span></div>
      <div class="kv"><span>Booked via</span><span>${esc(r.stay.channel)}</span></div>
    </div>
  </div>

  <h4>Room Charges</h4>
  <table><thead><tr><th>Description</th><th class="c">Nights</th><th class="r">Rate / Night</th><th class="r">Amount</th></tr></thead>
    <tbody><tr><td>Room ${esc(r.stay.room_number)} accommodation</td><td class="c">${r.stay.nights}</td><td class="r">${m(r.stay.rate_per_night)}</td><td class="r">${m(t.room_charges)}</td></tr></tbody></table>

  <h4>Restaurant &amp; Room Service</h4>
  ${orderRows ? `<table><thead><tr><th style="width:22%">Date / Order</th><th>Item</th><th class="c">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead><tbody>${orderRows}</tbody></table>`
    : `<p class="muted">${t.restaurant_charges > 0 ? "Itemised orders unavailable - total shown below." : "No restaurant charges during this stay."}</p>`}

  <table class="totals"><tbody>
    <tr><td>Room charges</td><td class="r">${m(t.room_charges)}</td></tr>
    <tr><td>Restaurant charges</td><td class="r">${m(t.restaurant_charges)}</td></tr>
    ${t.additional_charges ? `<tr><td>Additional charges</td><td class="r">${m(t.additional_charges)}</td></tr>` : ""}
    ${t.discount_amount ? `<tr><td>Discount</td><td class="r">- ${m(t.discount_amount)}</td></tr>` : ""}
    ${taxRows}
    <tr class="grand"><td>Grand Total</td><td class="r">${m(t.grand_total)}</td></tr>
    <tr><td>Advance payments</td><td class="r">- ${m(t.advance_paid)}</td></tr>
    <tr class="bal"><td>${t.balance_settled >= 0 ? "Balance paid at check-out" : "Refunded to guest"}</td><td class="r">${m(Math.abs(t.balance_settled))}</td></tr>
  </tbody></table>

  <h4>Payments Received</h4>
  ${paymentRows ? `<table><thead><tr><th>Date</th><th>Description</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>${paymentRows}</tbody></table>` : `<p class="muted">No payments recorded.</p>`}

  <div class="foot">
    <div class="muted">${r.stay.is_checked_out ? "Status: Checked out" : "Status: In-house (interim receipt)"}</div>
    <div class="sig">Authorised Signature</div>
  </div>
  <div class="thanks">Thank you for staying with ${esc(r.hotel.hotel_name)}. We look forward to welcoming you again.</div>
</div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`;
};

// path: "/receipts/customer/<id>" or "/receipts/booking/<id>"
export const printReceipt = async (path) => {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to print the receipt.");
    return;
  }
  win.document.write("<p style='font-family:sans-serif;padding:24px'>Preparing receipt...</p>");
  try {
    const { data } = await axios.get(`${API}${path}`);
    win.document.open();
    win.document.write(buildReceiptHTML(data));
    win.document.close();
  } catch (error) {
    win.close();
    alert(error.response?.data?.detail || "Could not load receipt.");
  }
};
