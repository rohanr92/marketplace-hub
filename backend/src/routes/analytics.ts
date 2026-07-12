import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/analytics/summary", async (req) => {
    const q = req.query as { days?: string };
    const days = Math.min(Math.max(Number(q.days ?? 30), 1), 365);

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const orders = await db.order.findMany({
      where: { tenantId: req.tenantId },
      select: {
        id: true,
        state: true,
        totalPrice: true,
        connectionId: true,
        channelCreatedAt: true,
        createdAt: true,
        itemsJson: true,
      },
    });

    const conns = await db.connection.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, label: true, type: true },
    });
    const connLabel = new Map(conns.map((c) => [c.id, c.label]));

    const deadStates = new Set(["canceled", "cancelled", "refused", "refunded"]);

    let totalSales = 0;
    let orderCount = 0;
    let unitsSold = 0;
    const byDay = new Map<string, { sales: number; orders: number }>();
    const byChannel = new Map<string, { label: string; sales: number; orders: number }>();

    for (const o of orders) {
      const when = o.channelCreatedAt ?? o.createdAt;
      if (!when || when < since) continue;
      if (deadStates.has((o.state ?? "").toLowerCase())) continue;

      const price = o.totalPrice ?? 0;
      totalSales += price;
      orderCount += 1;

      try {
        const items = JSON.parse(o.itemsJson ?? "[]");
        if (Array.isArray(items)) {
          for (const it of items) {
            unitsSold += Number(it.quantity ?? it.qty ?? 1) || 0;
          }
        }
      } catch {
        // ignore malformed itemsJson
      }

      const dk = dayKey(when);
      const dayRow = byDay.get(dk) ?? { sales: 0, orders: 0 };
      dayRow.sales += price;
      dayRow.orders += 1;
      byDay.set(dk, dayRow);

      const label = connLabel.get(o.connectionId) ?? "Unknown";
      const chRow = byChannel.get(o.connectionId) ?? { label, sales: 0, orders: 0 };
      chRow.sales += price;
      chRow.orders += 1;
      byChannel.set(o.connectionId, chRow);
    }

    const series: { date: string; sales: number; orders: number }[] = [];
    const cursor = new Date(since);
    const today = new Date();
    while (cursor <= today) {
      const dk = dayKey(cursor);
      const row = byDay.get(dk) ?? { sales: 0, orders: 0 };
      series.push({ date: dk, sales: Number(row.sales.toFixed(2)), orders: row.orders });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const channels = [...byChannel.values()]
      .map((c) => ({ label: c.label, orders: c.orders, sales: Number(c.sales.toFixed(2)) }))
      .sort((a, b) => b.sales - a.sales);

    // Action counts for the "Take action" panel.
    const pendingOrders = await db.order.count({
      where: { tenantId: req.tenantId, state: { in: ["awaiting_acceptance", "waiting_acceptance", "shipping", "to_accept"] } },
    });
    const refundOrders = await db.order.count({
      where: { tenantId: req.tenantId, refundedAmount: { gt: 0 } },
    });
    const trackedItems = await db.catalogItem.count({
      where: { tenantId: req.tenantId, tracked: true },
    });
    const activeChannels = await db.connection.count({
      where: { tenantId: req.tenantId, type: "mirakl", active: true },
    });

    return {
      days,
      totalSales: Number(totalSales.toFixed(2)),
      orderCount,
      unitsSold,
      avgOrderValue: orderCount ? Number((totalSales / orderCount).toFixed(2)) : 0,
      series,
      channels,
      actions: { pendingOrders, refundOrders, trackedItems, activeChannels },
    };
  });
}
