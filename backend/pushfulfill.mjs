import { db } from "./src/lib/db.ts";
import { pushFulfillmentToMirakl } from "./src/services/fulfillmentSync.ts";
const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const r = await pushFulfillmentToMirakl(o.id, o.tenantId);
console.log("RESULT:", JSON.stringify(r, null, 2));
process.exit(0);
