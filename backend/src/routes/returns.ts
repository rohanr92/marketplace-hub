import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";

export async function returnsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /returns  -> flat list of refunded lines across all orders
  app.get("/returns", async (req) => {
    const orders = await db.order.findMany({
      where: { tenantId: req.tenantId, refundedAmount: { gt: 0 } },
      orderBy: { channelCreatedAt: "desc" },
    });

    const conns = await db.connection.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, label: true, baseUrl: true },
    });
    const connMap = new Map(conns.map((c) => [c.id, c]));

    const rows: any[] = [];
    let totalRefunded = 0;

    for (const o of orders) {
      const conn = connMap.get(o.connectionId);
      let lines: any[] = [];
      try {
        lines = JSON.parse(o.refundJson ?? "[]");
      } catch {
        lines = [];
      }
      totalRefunded += o.refundedAmount ?? 0;

      for (const l of lines) {
        rows.push({
          orderId: o.id,
          channelOrderId: o.channelOrderId,
          channel: conn?.label ?? "Unknown",
          marketplaceUrl: conn ? `${conn.baseUrl}/mmp/shop/order/${o.channelOrderId}` : null,
          customerName: o.customerName,
          sku: l.sku,
          title: l.title,
          amount: l.amount ?? 0,
          quantity: l.quantity ?? 0,
          reasonCode: l.reasonCode,
          state: l.state,
          createdDate: l.createdDate,
          fullyRefunded: o.fullyRefunded,
        });
      }
    }

    return {
      count: rows.length,
      orderCount: orders.length,
      totalRefunded: Number(totalRefunded.toFixed(2)),
      returns: rows,
    };
  });
}
