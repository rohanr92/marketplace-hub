import { db } from "./src/lib/db.ts";
import { decrypt } from "./src/lib/crypto.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
const key = decrypt(conn.apiKeyEnc);
const docId = 23274834;
const oid = o.channelOrderId;

const paths = [
  `/api/orders/documents/download?document_ids=${docId}`,
  `/api/orders/documents/${docId}`,
  `/api/documents/${docId}`,
  `/api/orders/${oid}/documents`,
  `/api/orders/documents/download?order_ids=${oid}`,
];
for (const p of paths) {
  try {
    const res = await fetch(`${conn.baseUrl}${p}`, { headers: { Authorization: key } });
    const ct = res.headers.get("content-type");
    let note = "";
    if (ct && ct.includes("json")) { try { note = JSON.stringify(await res.json()).slice(0,120); } catch {} }
    console.log(`${res.status}  ${ct}  ${note}  <- ${p}`);
  } catch (e) { console.log(`ERR ${e.message} <- ${p}`); }
}
process.exit(0);
