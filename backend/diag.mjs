import { db } from "./src/lib/db.ts";
import { shopifyGraphQL } from "./src/services/shopify.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
console.log("HUB ORDER:", { state: o?.state, rawState: o?.rawState, shopifyOrderId: o?.shopifyOrderId, tracking: o?.trackingNumber });

if (o?.shopifyOrderId) {
  const shopify = await db.connection.findFirst({ where: { tenantId: o.tenantId, type: "shopify", active: true } });
  const data = await shopifyGraphQL(shopify,
    `query($id: ID!) {
      order(id: $id) {
        name displayFulfillmentStatus
        fulfillments(first: 5) { trackingInfo { number company url } }
      }
    }`,
    { id: o.shopifyOrderId }
  );
  console.log("SHOPIFY ORDER:", JSON.stringify(data.order, null, 2));
}
process.exit(0);
