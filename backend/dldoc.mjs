import { db } from "./src/lib/db.ts";
import { decrypt } from "./src/lib/crypto.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
const key = decrypt(conn.apiKeyEnc);
const docId = 23274834;

// Try the common Mirakl download paths; report which returns a PDF.
const paths = [
  `/api/orders/documents/${docId}/download`,
  `/api/orders/documents?document_ids=${docId}`,
  `/api/orders/${o.channelOrderId}/documents/${docId}`,
];
for (const p of paths) {
  try {
    const res = await fetch(`${conn.baseUrl}${p}`, { headers: { Authorization: key } });
    const ct = res.headers.get("content-type");
    console.log(`${res.status}  ${ct}  <- ${p}`);
  } catch (e) {
    console.log(`ERR ${e.message} <- ${p}`);
  }
}
process.exit(0);
