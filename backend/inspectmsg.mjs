import { db } from "./src/lib/db.ts";
import { decrypt } from "./src/lib/crypto.ts";

const conn = await db.connection.findFirst({ where: { type: "mirakl" } });
const auth = decrypt(conn.apiKeyEnc);
const H = { Authorization: auth, Accept: "application/json" };

// Try a handful of orders to find one that actually has a thread.
const orders = await db.order.findMany({ take: 20, orderBy: { channelCreatedAt: "desc" } });

let threadFound = null;
for (const o of orders) {
  const url = `${conn.baseUrl}/api/inbox/threads?entity_type=MMP_ORDER&entity_id=${encodeURIComponent(o.channelOrderId)}`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) { console.log(`M11 ${o.channelOrderId}: HTTP ${res.status}`); continue; }
  const data = await res.json();
  const threads = data?.data ?? data?.threads ?? [];
  if (Array.isArray(threads) && threads.length > 0) {
    console.log(`\n=== THREADS on ${o.channelOrderId}: ${threads.length} ===`);
    console.log(JSON.stringify(threads[0], null, 2).slice(0, 1500));
    threadFound = { orderId: o.channelOrderId, threadId: threads[0].id ?? threads[0].thread_id };
    break;
  }
}

if (!threadFound) {
  console.log("\nNo threads found on the last 20 orders. Showing raw M11 shape for newest order:");
  const o = orders[0];
  const res = await fetch(`${conn.baseUrl}/api/inbox/threads?entity_type=MMP_ORDER&entity_id=${encodeURIComponent(o.channelOrderId)}`, { headers: H });
  console.log("HTTP", res.status);
  console.log(JSON.stringify(await res.json(), null, 2).slice(0, 1200));
} else {
  // Fetch full thread (M10) to see message shape
  const res = await fetch(`${conn.baseUrl}/api/inbox/threads/${threadFound.threadId}`, { headers: H });
  console.log(`\n=== M10 full thread ${threadFound.threadId} (HTTP ${res.status}) ===`);
  console.log(JSON.stringify(await res.json(), null, 2).slice(0, 2500));
}
process.exit(0);
