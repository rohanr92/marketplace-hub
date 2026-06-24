import { db } from "../lib/db.js";
import { fetchMiraklOrderById, acceptMiraklOrder } from "./mirakl.js";
import { fetchShopifyByIdentifiers } from "./shopify.js";
import { pushOrderToShopify } from "./orderPush.js";

// Resolve available Shopify stock for a Mirakl line (sku -> upc-from-product_sku -> catalog).
async function availableForLine(shopifyConn: any, connectionId: string, l: any): Promise<number | null> {
  const sku = (l.offer_sku ?? l.product_shop_sku ?? l.product_sku ?? "").trim();
  if (sku) {
    const bySku = await fetchShopifyByIdentifiers(shopifyConn, [sku], "sku");
    if (bySku.found[0]) return bySku.found[0].inventory ?? 0;
  }
  const upc = l.product_sku && String(l.product_sku).includes("_") ? String(l.product_sku).split("_")[0].trim() : null;
  if (upc) {
    const byUpc = await fetchShopifyByIdentifiers(shopifyConn, [upc], "barcode");
    if (byUpc.found[0]) return byUpc.found[0].inventory ?? 0;
  }
  if (sku) {
    const offer = await db.channelOffer.findFirst({ where: { connectionId, offerSku: sku } });
    if (offer?.catalogItemId) {
      const ci = await db.catalogItem.findUnique({ where: { id: offer.catalogItemId } });
      if (ci) return ci.inventory ?? 0;
    }
  }
  return null; // unmatched
}

// Auto-accept (if in stock, ignoring buffer) + auto-push at SHIPPING. Runs per tenant.
export async function autoProcessOrders(tenantId: string) {
  const shopifyConn = await db.connection.findFirst({ where: { tenantId, type: "shopify", active: true } });
  if (!shopifyConn) return;

  const miraklConns = await db.connection.findMany({ where: { tenantId, type: "mirakl", active: true } });

  for (const conn of miraklConns) {
    const orders = await db.order.findMany({
      where: { tenantId, connectionId: conn.id, rawState: { in: ["WAITING_ACCEPTANCE", "SHIPPING"] } },
    });

    for (const o of orders) {
      try {
        // --- AUTO-ACCEPT ---
        if (o.rawState === "WAITING_ACCEPTANCE") {
          const raw = await fetchMiraklOrderById(conn, o.channelOrderId);
          if (!raw || raw.order_state !== "WAITING_ACCEPTANCE") continue;
          const lines = raw.order_lines ?? [];

          let allInStock = true;
          for (const l of lines) {
            const avail = await availableForLine(shopifyConn, conn.id, l);
            const need = l.quantity ?? 1;
            if (avail === null || avail < need) { allInStock = false; break; }
          }
          if (!allInStock) {
            console.log(`[auto] ${o.channelOrderId}: not all lines in stock - left for manual accept`);
            continue;
          }

          const lineIds = lines.map((l: any) => l.order_line_id ?? l.id).filter(Boolean);
          await acceptMiraklOrder(conn, o.channelOrderId, lineIds);
          await db.order.update({ where: { id: o.id }, data: { rawState: "WAITING_DEBIT", state: "payment_pending" } });
          console.log(`[auto] ${o.channelOrderId}: AUTO-ACCEPTED (in stock)`);
        }

        // --- AUTO-PUSH at SHIPPING ---
        if (o.rawState === "SHIPPING" && !o.shopifyOrderId) {
          const r = await pushOrderToShopify(o.id, tenantId);
          if (r.skipped) console.log(`[auto] ${o.channelOrderId}: push skipped - ${r.reason}`);
          else console.log(`[auto] ${o.channelOrderId}: AUTO-PUSHED to Shopify ${r.shopifyName}`);
        }
      } catch (e: any) {
        console.error(`[auto] ${o.channelOrderId} failed:`, e.message);
      }
    }
  }
}

export async function autoProcessAllTenants() {
  const tenants = await db.tenant.findMany();
  for (const t of tenants) {
    try { await autoProcessOrders(t.id); }
    catch (e: any) { console.error(`[auto] tenant ${t.id} failed:`, e.message); }
  }
}
