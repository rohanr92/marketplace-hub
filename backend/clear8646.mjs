import { db } from "./src/lib/db.ts";
const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
if (!o) { console.log("Order not found"); process.exit(0); }
await db.order.update({
  where: { id: o.id },
  data: { shopifyOrderId: null, state: "to_ship" },
});
console.log("Cleared shopifyOrderId for 4763828303-A. Push button will reappear.");
process.exit(0);
