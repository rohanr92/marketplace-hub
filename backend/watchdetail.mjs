import { db } from "./src/lib/db.js";
console.log("Change ONE product now. Watching runIds for 90s - shows if it's surgical (1-3 SKUs) or full (600+).\n");
let lastSeen = new Date();
const runsSeen = new Set();
for (let i = 0; i < 18; i++) {
  const logs = await db.syncLog.findMany({ where: { createdAt: { gt: lastSeen } }, orderBy: { createdAt: "asc" }, take: 3000, select: { createdAt: true, runId: true } });
  if (logs.length) {
    lastSeen = logs[logs.length-1].createdAt;
    const byRun = {};
    for (const l of logs) byRun[l.runId] = (byRun[l.runId]||0)+1;
    for (const [rid, count] of Object.entries(byRun)) {
      if (!runsSeen.has(rid)) {
        runsSeen.add(rid);
        console.log(`  run ${rid.slice(0,20)} : ${count} SKUs  ${count > 20 ? "<<< FULL SYNC" : ">>> surgical"}`);
      }
    }
  }
  await new Promise(r => setTimeout(r, 5000));
}
process.exit(0);
