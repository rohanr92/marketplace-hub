import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { syncConnectionOrders } from "../services/orderSync.js";

export async function orderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // List orders for this tenant
  app.get("/orders", async (req) => {
    const rows = await db.order.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { channelCreatedAt: "desc" },
      include: { connection: { select: { label: true, type: true } } },
      take: 200,
    });
    return rows.map((o) => ({
      id: o.id,
      channelOrderId: o.channelOrderId,
      channel: o.connection.label,
      state: o.state,
      rawState: o.rawState,
      customerName: o.customerName,
      totalPrice: o.totalPrice,
      channelCreatedAt: o.channelCreatedAt,
      items: JSON.parse(o.itemsJson),
    }));
  });

  // Trigger a sync now for all this tenant's Mirakl connections
  app.post("/orders/sync", async (req) => {
    const conns = await db.connection.findMany({
      where: { tenantId: req.tenantId, type: "mirakl", active: true },
    });
    let total = 0;
    const errors: string[] = [];
    for (const c of conns) {
      try {
        const r = await syncConnectionOrders(c.id);
        total += r.synced;
      } catch (e: any) {
        errors.push(`${c.label}: ${e.message}`);
      }
    }
    return { synced: total, connections: conns.length, errors };
  });

  // DEV ONLY: create sample orders so you can see the flow without live keys.
  app.post("/orders/sample", async (req) => {
    let conn = await db.connection.findFirst({
      where: { tenantId: req.tenantId, type: "mirakl" },
    });
    if (!conn) {
      conn = await db.connection.create({
        data: {
          tenantId: req.tenantId,
          type: "mirakl",
          label: "Nordstrom - Sample",
          baseUrl: "https://sample.mirakl.net",
          apiKeyEnc: "sample",
          active: true,
        },
      });
    }

    const samples = [
      { state: "awaiting_acceptance", raw: "WAITING_ACCEPTANCE", name: "Donna Ford", total: 89, sku: "VERA-TAN-W36", title: "Vera Flat Sandal" },
      { state: "to_ship", raw: "SHIPPING", name: "Taylor Smith", total: 124, sku: "NAPO-BLA-W36", title: "Napoli Flat Sandal" },
      { state: "shipped", raw: "SHIPPED", name: "Maria Lopez", total: 156, sku: "JIHILA-BLA-W39", title: "Jimena High Laces Espadrille" },
      { state: "delivered", raw: "RECEIVED", name: "Anna Chen", total: 98, sku: "NIVA-CHE-W39", title: "Niva Flat Sandal" },
    ];

    let n = 0;
    for (const s of samples) {
      const orderId = `SAMPLE-${Date.now()}-${n}`;
      await db.order.create({
        data: {
          tenantId: req.tenantId,
          connectionId: conn.id,
          channelOrderId: orderId,
          state: s.state,
          rawState: s.raw,
          customerName: s.name,
          totalPrice: s.total,
          channelCreatedAt: new Date(Date.now() - n * 3600_000),
          itemsJson: JSON.stringify([{ sku: s.sku, title: s.title, qty: 1, price: s.total }]),
        },
      });
      n++;
    }
    return { created: n };
  });
}
