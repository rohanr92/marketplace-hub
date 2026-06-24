import { db } from "./src/lib/db.ts";
import { listMiraklOrderDocuments } from "./src/services/mirakl.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
const docs = await listMiraklOrderDocuments(conn, "4763828303-A");
console.log("=== ORDER DOCUMENTS ===");
console.log(JSON.stringify(docs, null, 2));
process.exit(0);
