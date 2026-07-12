import { db } from "./src/lib/db.js";
// Look at the last 3000 sync logs, group by runId, show how many SKUs per run + the time
const logs = await db.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 3000,
  select: { createdAt: true, runId: true, offerSku: true } });
const byRun = {};
for (const l of logs) {
  (byRun[l.runId ?? "none"] ??= { count: 0, first: l.createdAt, last: l.createdAt });
  byRun[l.runId].count++;
  if (l.createdAt < byRun[l.runId].first) byRun[l.runId].first = l.createdAt;
  if (l.createdAt > byRun[l.runId].last) byRun[l.runId].last = l.createdAt;
}
console.log("=== Sync runs (each runId = one sync call) ===");
const runs = Object.entries(byRun).sort((a,b) => b[1].last - a[1].last).slice(0, 15);
for (const [rid, info] of runs) {
  console.log(`${info.last.toISOString().slice(11,19)} | ${String(info.count).padStart(4)} SKUs | runId=${rid.slice(0,24)}`);
}
process.exit(0);
