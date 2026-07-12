import { db } from "./src/lib/db.js";
import { fetchMiraklOrderById } from "./src/services/mirakl.js";
import { pushOrderToShopify } from "./src/services/orderPush.js";

const ORDER_IDS = [
  "1047486553-50000-A","1047565523-50000-A","1047565551-50000-A",
  "1047568766-50000-A","1047585655-50001-A","1047595018-50000-A",
  "1047595152-50002-A","1047622998-50002-A","1047629149-50000-A",
  "1047647366-50000-A","1047655087-50000-A","1047655308-50000-A",
  "1047668688-50000-A","1047670223-50000-A","1047691885-50000-A",
  "1047696192-50004-A",
];

const nordstrom = await db.connection.findFirst({
  where: { type: "mirakl", baseUrl: { contains: "nordstrom" } },
});
if (!nordstrom) { console.log("Nordstrom connection not found"); process.exit(1); }
console.log(`Using: ${nordstrom.label} (${nordstrom.baseUrl})  tenant=${nordstrom.tenantId}\n`);

function mapState(raw) {
  const m = { WAITING_ACCEPTANCE:"awaiting_acceptance", WAITING_DEBIT:"payment_pending",
    WAITING_DEBIT_PAYMENT:"payment_pending", SHIPPING:"to_ship", SHIPPED:"shipped",
    TO_COLLECT:"to_collect", RECEIVED:"delivered", CLOSED:"closed", REFUSED:"refused", CANCELED:"canceled" };
  return m[raw] ?? String(raw).toLowerCase();
}

let pulled = 0, pushed = 0, skipped = 0, failed = 0;

for (const oid of ORDER_IDS) {
  try {
    const raw = await fetchMiraklOrderById(nordstrom, oid);
    if (!raw) { console.log(`NOT ON NORDSTROM  ${oid}`); failed++; continue; }
    const cust = raw.customer ?? {};
    const lines = (raw.order_lines ?? []).map((l) => ({
      sku: l.offer_sku ?? l.product_sku ?? "", title: l.product_title ?? "",
      qty: l.quantity ?? 1, price: l.total_price ?? l.price ?? 0,
    }));
    const order = await db.order.upsert({
      where: { connectionId_channelOrderId: { connectionId: nordstrom.id, channelOrderId: oid } },
      create: {
        tenantId: nordstrom.tenantId, connectionId: nordstrom.id, channelOrderId: oid,
        state: mapState(raw.order_state), rawState: raw.order_state,
        customerName: [cust.firstname, cust.lastname].filter(Boolean).join(" ") || null,
        totalPrice: raw.total_price ?? 0,
        channelCreatedAt: raw.created_date ? new Date(raw.created_date) : null,
        itemsJson: JSON.stringify(lines),
      },
      update: { state: mapState(raw.order_state), rawState: raw.order_state, itemsJson: JSON.stringify(lines) },
    });
    pulled++;
    const r = await pushOrderToShopify(order.id, nordstrom.tenantId);
    if (r.skipped) { console.log(`PULLED, SKIPPED   ${oid}  [${raw.order_state}] - ${r.reason}`); skipped++; }
    else { console.log(`PUSHED            ${oid}  -> ${r.shopifyName ?? r.shopifyOrderId}${r.unmatched?.length ? `  UNMATCHED: ${r.unmatched.join(", ")}` : ""}`); pushed++; }
  } catch (e) {
    console.log(`FAILED            ${oid}  - ${e.message}`); failed++;
  }
}

console.log(`\n=== SUMMARY ===\nPulled: ${pulled}\nPushed: ${pushed}\nSkipped: ${skipped}\nFailed: ${failed}`);
process.exit(0);
