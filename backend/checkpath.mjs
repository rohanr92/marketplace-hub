import { db } from "./src/lib/db.js";

// Look at the most recent sync logs - the runId prefix tells us what triggered them
const logs = await db.syncLog.findMany({
  orderBy: { createdAt: "desc" },
  take: 30,
  select: { createdAt: true, offerSku: true, runId: true, source: true, quantitySent: true },
});
console.log("=== Recent sync logs with source/runId (shows what triggered them) ===");
for (const l of logs) {
  console.log(`${l.createdAt.toISOString().slice(11,19)} | source=${l.source ?? "?"} | runId=${(l.runId ?? "").slice(0,20)} | ${l.offerSku} | sent=${l.quantitySent}`);
}
process.exit(0);
