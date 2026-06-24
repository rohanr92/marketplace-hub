import { db } from "../lib/db.js";
import { pushMiraklStock } from "./mirakl.js";

// per-channel last successful push time (ms) to respect Mirakl once-per-minute limit
const lastPushAt = new Map<string, number>();
const pendingTimers = new Map<string, NodeJS.Timeout>();
const MIN_PUSH_INTERVAL_MS = 60_000;

// Compute the buffer for a given offer using rule priority:
// SKU rule > UPC rule > title-contains rule > channel default.
export function resolveBuffer(
  rules: { scope: string; value: string; amount: number }[],
  defaultBuffer: number,
  ctx: { sku?: string | null; upc?: string | null; title?: string | null }
): number {
  const skuRule = rules.find((r) => r.scope === "sku" && ctx.sku && r.value === ctx.sku);
  if (skuRule) return skuRule.amount;
  const upcRule = rules.find((r) => r.scope === "upc" && ctx.upc && r.value === ctx.upc);
  if (upcRule) return upcRule.amount;
  const titleRule = rules.find(
    (r) => r.scope === "title" && ctx.title && ctx.title.toLowerCase().includes(r.value.toLowerCase())
  );
  if (titleRule) return titleRule.amount;
  return defaultBuffer;
}

// Build the list of {offerSku, catalogSku, stock, buffer, qty} for a channel's
// matched + sync-eligible offers. Does NOT push. Used by preview and run.
export async function computeChannelPlan(connectionId: string, tenantId: string, only?: string[]) {
  const conn = await db.connection.findFirst({ where: { id: connectionId, tenantId } });
  if (!conn) throw new Error("Channel not found");

  let offers = await db.channelOffer.findMany({ where: { connectionId } });
  if (only && only.length) {
    const want = new Set(only.map((x) => String(x).trim()).filter(Boolean));
    // match an offer if its SKU or UPC is in the changed set
    offers = offers.filter((o) =>
      (o.offerSku && want.has(o.offerSku)) ||
      (o.offerUpc && want.has(o.offerUpc))
    );
  }
  const catalog = await db.catalogItem.findMany({ where: { tenantId } });
  const rules = await db.bufferRule.findMany({ where: { connectionId } });

  const bySku = new Map(catalog.map((c) => [c.sku, c]));
  const byUpc = new Map(catalog.filter((c) => c.barcode).map((c) => [c.barcode!, c]));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const mode = conn.mappingMode;

  const plan: any[] = [];
  for (const o of offers) {
    // Resolve which catalog item this offer maps to, by mode.
    let cat: any = null;
    if (mode === "manual") cat = o.catalogItemId ? byId.get(o.catalogItemId) : null;
    else if (mode === "auto_upc") cat = o.offerUpc ? byUpc.get(o.offerUpc) : null;
    else cat = bySku.get(o.offerSku); // auto_sku / full_catalog

    if (!cat) continue; // unmatched -> never touched
    if (!cat.tracked) {
      plan.push({ offerSku: o.offerSku, catalogSku: cat.sku, stock: cat.inventory, buffer: 0, qty: cat.inventory, skipped: true, reason: "not tracked" });
      continue;
    }

    const buffer = resolveBuffer(rules, conn.defaultBuffer, { sku: cat.sku, upc: cat.barcode, title: cat.title });
    const qty = Math.max(0, cat.inventory - buffer);
    plan.push({ offerSku: o.offerSku, catalogSku: cat.sku, stock: cat.inventory, buffer, qty, skipped: false });
  }
  return { conn, plan };
}

// Run a sync: compute plan, optionally push to Mirakl, write SyncLog rows.
export async function runChannelSync(connectionId: string, tenantId: string, opts: { dryRun: boolean; source?: "auto" | "manual"; only?: string[] }) {
  const { conn, plan } = await computeChannelPlan(connectionId, tenantId, opts.only);
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (opts.dryRun) {
    // record preview rows
    for (const p of plan) {
      await db.syncLog.create({
        data: {
          tenantId, connectionId, runId, offerSku: p.offerSku, catalogSku: p.catalogSku,
          stock: p.stock, bufferApplied: p.buffer, quantitySent: p.qty,
          status: p.skipped ? "skipped" : "preview", message: p.skipped ? p.reason : null,
        },
      });
    }
    return { runId, dryRun: true, total: plan.length, rows: plan };
  }

  // live push - only the non-skipped rows
  const toPush = plan.filter((p) => !p.skipped).map((p) => ({ offerSku: p.offerSku, quantity: p.qty }));
  let importId = "";
  let pushError = "";

  // Throttle: auto-triggered syncs respect Mirakl's once-per-minute stock limit.
  // Manual "Sync now" always pushes.
  const last = lastPushAt.get(connectionId) ?? 0;
  const sinceLast = Date.now() - last;
  const throttled = opts.source === "auto" && sinceLast < MIN_PUSH_INTERVAL_MS;

  if (throttled) {
    const waitMs = MIN_PUSH_INTERVAL_MS - sinceLast + 500;
    const waitSec = Math.ceil(waitMs / 1000);
    // Log one skipped row so it's visible the change is queued.
    await db.syncLog.create({
      data: {
        tenantId, connectionId, runId, offerSku: "(batch)", catalogSku: null,
        stock: 0, bufferApplied: 0, quantitySent: 0,
        status: "skipped", message: `throttled - auto-push scheduled in ${waitSec}s`,
      },
    });
    // Trailing debounce: (re)schedule a single push when the cooldown ends.
    const existing = pendingTimers.get(connectionId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      pendingTimers.delete(connectionId);
      // fire the real push; it will pass the throttle now that cooldown has elapsed
      runChannelSync(connectionId, tenantId, { dryRun: false, source: "auto", only: opts.only })
        .catch((e) => console.error("[debounce] scheduled push failed:", e.message));
    }, waitMs);
    // allow process to exit even if a timer is pending (dev convenience)
    if (typeof t.unref === "function") t.unref();
    pendingTimers.set(connectionId, t);
    return { runId, dryRun: false, pushed: 0, throttled: true, waitSec, scheduled: true };
  }

  if (toPush.length > 0) {
    try {
      const r = await pushMiraklStock(conn, toPush);
      importId = r.importId;
      lastPushAt.set(connectionId, Date.now());
    } catch (e: any) {
      pushError = e.message;
    }
  }

  for (const p of plan) {
    let status = "success";
    let message: string | null = null;
    if (p.skipped) { status = "skipped"; message = p.reason; }
    else if (pushError) { status = "error"; message = pushError; }
    await db.syncLog.create({
      data: {
        tenantId, connectionId, runId, offerSku: p.offerSku, catalogSku: p.catalogSku,
        stock: p.stock, bufferApplied: p.buffer, quantitySent: p.qty,
        status, message, miraklImportId: importId || null,
      },
    });
  }

  await db.connection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date() } });
  return { runId, dryRun: false, pushed: toPush.length, importId, error: pushError || null };
}

// delete sync logs older than N hours
export async function cleanupSyncLogs(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  const r = await db.syncLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}

import { fetchShopifyByIdentifiers, shopifyGraphQL } from "./shopify.js";

// Refresh given SKUs (or all tracked) from Shopify into the catalog.
export async function refreshCatalogFromShopify(tenantId: string, onlySkus?: string[]) {
  const conn = await db.connection.findFirst({ where: { tenantId, type: "shopify" } });
  if (!conn) return { refreshed: 0 };

  const where: any = { tenantId, tracked: true, source: "shopify" };
  if (onlySkus && onlySkus.length) where.sku = { in: onlySkus };
  const tracked = await db.catalogItem.findMany({ where });
  if (tracked.length === 0) return { refreshed: 0 };

  const skus = tracked.map((t) => t.sku);
  const { found } = await fetchShopifyByIdentifiers(conn as any, skus, "sku");
  let refreshed = 0;
  for (const it of found) {
    await db.catalogItem.updateMany({
      where: { tenantId, sku: it.sku },
      data: { barcode: it.barcode, inventory: it.inventory, price: it.price, title: it.title, imageUrl: it.imageUrl },
    });
    refreshed++;
  }
  return { refreshed };
}

// Resolve a Shopify inventory_item_id (numeric) to its variant SKU.
export async function skuForInventoryItem(tenantId: string, inventoryItemId: string | number) {
  const conn = await db.connection.findFirst({ where: { tenantId, type: "shopify" } });
  if (!conn) return null;
  const gid = `gid://shopify/InventoryItem/${inventoryItemId}`;
  const data: any = await shopifyGraphQL(
    conn as any,
    `query($id: ID!) { inventoryItem(id: $id) { variant { sku } } }`,
    { id: gid }
  );
  return data?.inventoryItem?.variant?.sku ?? null;
}

// Run sync for every sync-enabled marketplace channel of a tenant (live push).
export async function syncAllChannelsForTenant(tenantId: string, only?: string[]) {
  const channels = await db.connection.findMany({
    where: { tenantId, type: "mirakl", syncEnabled: true },
  });
  const results: any[] = [];
  for (const ch of channels) {
    try {
      const r = await runChannelSync(ch.id, tenantId, { dryRun: false, source: "auto", only });
      results.push({ channel: ch.label, ...r });
    } catch (e: any) {
      results.push({ channel: ch.label, error: e.message });
    }
  }
  return results;
}
