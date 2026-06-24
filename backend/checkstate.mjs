import { db } from "./src/lib/db.ts";
import { fetchMiraklOrderById } from "./src/services/mirakl.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
const raw = await fetchMiraklOrderById(conn, "4763828303-A");
console.log("MACY'S ORDER STATE:", raw?.order_state);
console.log("TRACKING:", raw?.shipping_tracking, "| carrier:", raw?.shipping_company ?? raw?.shipping_carrier_code);
console.log("HUB STATE:", o.state, "| hub tracking:", o.trackingNumber);
process.exit(0);
