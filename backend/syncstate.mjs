import { db } from "./src/lib/db.ts";
const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
await db.order.update({ where: { id: o.id }, data: { state: "shipped_to_marketplace", rawState: "SHIPPED" } });
console.log("Hub order marked shipped_to_marketplace.");
process.exit(0);
