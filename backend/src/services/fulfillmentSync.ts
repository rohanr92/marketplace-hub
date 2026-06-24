import { db } from "../lib/db.js";
import { shopifyGraphQL } from "./shopify.js";
import { setMiraklTracking, shipMiraklOrder, miraklCarrier } from "./mirakl.js";

// Read fulfillment (tracking) for a Shopify order id.
async function getShopifyFulfillment(shopifyConn: any, shopifyOrderGid: string) {
  const data: any = await shopifyGraphQL(
    shopifyConn,
    `query($id: ID!) {
      order(id: $id) {
        id name displayFulfillmentStatus
        fulfillments(first: 5) {
          trackingInfo { number company url }
        }
      }
    }`,
    { id: shopifyOrderGid }
  );
  const order = data?.order;
  if (!order) return null;
  const fInfo = (order.fulfillments ?? []).flatMap((f: any) => f.trackingInfo ?? []);
  const t = fInfo.find((x: any) => x?.number) ?? null;
  return { status: order.displayFulfillmentStatus, tracking: t };
}

// Push tracking + ship for one hub order. Idempotent via state.
export async function pushFulfillmentToMirakl(orderRowId: string, tenantId: string) {
  const order = await db.order.findFirst({ where: { id: orderRowId, tenantId } });
  if (!order) throw new Error("Order not found");
  if (!order.shopifyOrderId) return { skipped: true, reason: "not in Shopify yet" };
  if (order.state === "shipped_to_marketplace") return { skipped: true, reason: "already shipped to marketplace" };

  const shopifyConn = await db.connection.findFirst({ where: { tenantId, type: "shopify", active: true } });
  if (!shopifyConn) throw new Error("No Shopify connection");
  const miraklConn = await db.connection.findUnique({ where: { id: order.connectionId } });
  if (!miraklConn) throw new Error("Mirakl connection missing");

  const f = await getShopifyFulfillment(shopifyConn, order.shopifyOrderId);
  if (!f || !f.tracking || !f.tracking.number) {
    return { skipped: true, reason: "no tracking in Shopify yet" };
  }

  const carrier = miraklCarrier(f.tracking.company);
  await setMiraklTracking(miraklConn, order.channelOrderId, {
    carrierCode: carrier.code,
    carrierName: carrier.name,
    carrierUrl: f.tracking.url ?? null,
    trackingNumber: f.tracking.number,
  });
  await shipMiraklOrder(miraklConn, order.channelOrderId);

  await db.order.update({
    where: { id: order.id },
    data: {
      state: "shipped_to_marketplace",
      rawState: "SHIPPED",
      trackingNumber: f.tracking.number,
      carrier: carrier.name,
    },
  });

  return { skipped: false, tracking: f.tracking.number, carrier: carrier.name };
}

// Worker fallback: find pushed orders now fulfilled in Shopify, push tracking to Mirakl.
export async function syncFulfillmentsForTenant(tenantId: string) {
  const candidates = await db.order.findMany({
    where: { tenantId, shopifyOrderId: { not: null }, state: "pushed_to_shopify" },
  });
  for (const o of candidates) {
    try {
      const r = await pushFulfillmentToMirakl(o.id, tenantId);
      if (!r.skipped) console.log(`[fulfill] ${o.channelOrderId}: tracking ${r.tracking} (${r.carrier}) -> Mirakl SHIPPED`);
    } catch (e: any) {
      console.error(`[fulfill] ${o.channelOrderId} failed: ${e.message}`);
    }
  }
}

export async function syncFulfillmentsAllTenants() {
  const tenants = await db.tenant.findMany();
  for (const t of tenants) {
    try { await syncFulfillmentsForTenant(t.id); }
    catch (e: any) { console.error(`[fulfill] tenant ${t.id} failed: ${e.message}`); }
  }
}
