import { db } from "./src/lib/db.ts";
import { fetchMiraklOrderById } from "./src/services/mirakl.ts";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.ts";

// Mirror of availableForLine in orderAutomation.ts
async function availableForLine(shopifyConn, connectionId, l) {
  const sku = (l.offer_sku ?? l.product_shop_sku ?? l.product_sku ?? "").trim();
  if (sku) {
    const bySku = await fetchShopifyByIdentifiers(shopifyConn, [sku], "sku");
    if (bySku.found[0]) return { qty: bySku.found[0].inventory ?? 0, via: "sku", key: sku };
  }
  const upc = l.product_sku && String(l.product_sku).includes("_") ? String(l.product_sku).split("_")[0].trim() : null;
  if (upc) {
    const byUpc = await fetchShopifyByIdentifiers(shopifyConn, [upc], "barcode");
    if (byUpc.found[0]) return { qty: byUpc.found[0].inventory ?? 0, via: "upc", key: upc };
  }
  if (sku) {
    const offer = await db.channelOffer.findFirst({ where: { connectionId, offerSku: sku } });
    if (offer?.catalogItemId) {
      const ci = await db.catalogItem.findUnique({ where: { id: offer.catalogItemId } });
      if (ci) return { qty: ci.inventory ?? 0, via: "catalog", key: sku };
    }
  }
  return null;
}

const tenant = await db.tenant.findFirst();
const shopifyConn = await db.connection.findFirst({ where: { tenantId: tenant.id, type: "shopify", active: true } });
const miraklConns = await db.connection.findMany({ where: { tenantId: tenant.id, type: "mirakl", active: true } });

console.log("\n=== AUTO-ACCEPT DRY RUN (no orders will be accepted) ===\n");

for (const conn of miraklConns) {
  // Test against ALL orders so we can see the inventory check working, regardless of current state.
  const orders = await db.order.findMany({ where: { connectionId: conn.id }, take: 8 });
  for (const o of orders) {
    let raw;
    try { raw = await fetchMiraklOrderById(conn, o.channelOrderId); }
    catch (e) { console.log(`${o.channelOrderId}  [${conn.label}]  fetch failed: ${e.message}`); continue; }
    if (!raw) { console.log(`${o.channelOrderId}  not found on Mirakl`); continue; }

    const lines = raw.order_lines ?? [];
    let allInStock = true;
    const parts = [];
    for (const l of lines) {
      const need = l.quantity ?? 1;
      const a = await availableForLine(shopifyConn, conn.id, l);
      if (a === null) { allInStock = false; parts.push(`${l.offer_sku} need ${need} UNMATCHED`); }
      else { if (a.qty < need) allInStock = false; parts.push(`${a.key} need ${need} avail ${a.qty} (${a.via})`); }
    }
    const decision = raw.order_state !== "WAITING_ACCEPTANCE"
      ? `(state ${raw.order_state} - would only act if WAITING_ACCEPTANCE)`
      : (allInStock ? "WOULD ACCEPT" : "would SKIP (short/unmatched)");
    console.log(`${o.channelOrderId}  [${raw.order_state}]  ${decision}`);
    for (const p of parts) console.log(`      - ${p}`);
  }
}
process.exit(0);
