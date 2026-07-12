import "dotenv/config";
import cron from "node-cron";
import { syncAllConnections } from "../services/orderSync.js";
import { db } from "../lib/db.js";
import { refreshCatalogFromShopify, syncAllChannelsForTenant, cleanupSyncLogs } from "../services/syncEngine.js";
import { autoProcessAllTenants } from "../services/orderAutomation.js";
import { syncFulfillmentsAllTenants } from "../services/fulfillmentSync.js";

console.log("Worker started.");

// --- Order ingest (Phase 2): poll Mirakl every 5 min ---
syncAllConnections().then(() => autoProcessAllTenants());
cron.schedule("*/5 * * * *", async () => {
  console.log("[cron] order poll");
  await syncAllConnections();
  console.log("[cron] auto-process orders");
  await autoProcessAllTenants();
});

// --- Backup reconciliation (webhooks are the instant path; this is the safety net) ---
// Shopify says webhook delivery isn't guaranteed, so reconcile periodically.
async function reconcileAllTenants() {
  const tenants = await db.tenant.findMany();
  for (const t of tenants) {
    try {
      await refreshCatalogFromShopify(t.id);   // Shopify -> platform
      await syncAllChannelsForTenant(t.id);     // platform -> marketplaces
      console.log(`[cron] reconciled tenant ${t.name}`);
    } catch (e: any) {
      console.error(`[cron] reconcile failed for ${t.name}: ${e.message}`);
    }
  }
  // After per-tenant reconcile: push any Shopify-fulfilled orders back to Mirakl.
  await syncFulfillmentsAllTenants();
}
// Full inventory reconcile every day (instant path is the webhook).
// Catches anything a missed webhook dropped. Runs at 00:00 daily.
cron.schedule("0 */6 * * *", reconcileAllTenants);

// --- Log cleanup: delete sync logs older than 6h, hourly ---
cron.schedule("0 * * * *", async () => {
  const n = await cleanupSyncLogs(6);
  if (n) console.log(`[cron] cleaned ${n} old sync logs`);
});

console.log("Schedules: order poll 5m, full reconcile daily, log cleanup hourly (6h retention). Webhooks handle instant inventory sync.");
