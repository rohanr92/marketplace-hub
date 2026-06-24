import { db } from "./src/lib/db.ts";
import { fetchMiraklOrderById } from "./src/services/mirakl.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
const raw = await fetchMiraklOrderById(conn, "4763828303-A");

// Print everything EXCEPT order_lines (we already saw those).
const { order_lines, ...rest } = raw;
console.log("=== ORDER-LEVEL FIELDS ===");
console.log(JSON.stringify(rest, null, 2));
process.exit(0);
