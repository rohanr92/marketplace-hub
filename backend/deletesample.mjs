import { db } from "./src/lib/db.ts";
const conn = await db.connection.findFirst({ where: { label: { contains: "Nordstrom - Sample" } } });
if (!conn) { console.log("Sample connection not found - maybe already gone."); process.exit(0); }
const delOrders = await db.order.deleteMany({ where: { connectionId: conn.id } });
const delOffers = await db.channelOffer.deleteMany({ where: { connectionId: conn.id } });
await db.connection.delete({ where: { id: conn.id } });
console.log(`Deleted Nordstrom Sample: ${delOrders.count} orders, ${delOffers.count} offers, 1 connection.`);
process.exit(0);
