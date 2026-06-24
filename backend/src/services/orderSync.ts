import { db } from "../lib/db.js";
import { fetchMiraklOrders, normalizeMiraklOrder } from "./mirakl.js";

// Pull orders for one Mirakl connection and upsert them.
export async function syncConnectionOrders(connectionId: string) {
  const conn = await db.connection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.type !== "mirakl" || !conn.active) {
    return { synced: 0, skipped: true };
  }

  // Look back from last sync (minus 10 min safety overlap), or 30 days on first run.
  const since = conn.lastSyncAt
    ? new Date(conn.lastSyncAt.getTime() - 10 * 60 * 1000)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const raws = await fetchMiraklOrders(conn, since.toISOString());
  let synced = 0;

  for (const raw of raws) {
    const n = normalizeMiraklOrder(raw);
    if (!n.channelOrderId) continue;
    await db.order.upsert({
      where: {
        connectionId_channelOrderId: {
          connectionId: conn.id,
          channelOrderId: n.channelOrderId,
        },
      },
      create: { ...n, tenantId: conn.tenantId, connectionId: conn.id },
      update: {
        state: n.state,
        rawState: n.rawState,
        totalPrice: n.totalPrice,
        itemsJson: n.itemsJson,
      },
    });
    synced++;
  }

  await db.connection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date() },
  });

  return { synced, skipped: false };
}

// Sync every active Mirakl connection across all tenants (used by cron).
export async function syncAllConnections() {
  const conns = await db.connection.findMany({
    where: { type: "mirakl", active: true },
  });
  for (const c of conns) {
    try {
      const r = await syncConnectionOrders(c.id);
      console.log(`[sync] ${c.label}: ${r.synced} orders`);
    } catch (e: any) {
      console.error(`[sync] ${c.label} failed:`, e.message);
    }
  }
}
