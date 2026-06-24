import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";

function bucketOf(rawState: string): string {
  switch (rawState) {
    case "STAGING":
    case "WAITING_DEBIT":
    case "WAITING_DEBIT_PAYMENT":
      return "pending";
    case "WAITING_ACCEPTANCE":
      return "to_accept";
    case "SHIPPING":
      return "to_ship";
    case "SHIPPED":
    case "TO_COLLECT":
    case "RECEIVED":
    case "CLOSED":
      return "shipped";
    case "REFUSED":
    case "CANCELED":
      return "closed";
    default:
      return "other";
  }
}

export async function ordersListRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/orders/list", async (req) => {
    const q = z.object({
      bucket: z.enum(["all", "pending", "to_accept", "to_ship", "shipped", "closed"]).default("all"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const orders = await db.order.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { channelCreatedAt: "desc" },
    });
    const conns = await db.connection.findMany({ where: { tenantId: req.tenantId } });
    const connById = new Map(conns.map((c) => [c.id, c]));

    const enriched = orders.map((o) => {
      const c = connById.get(o.connectionId);
      const baseUrl = c?.baseUrl ?? "";
      let items: any[] = [];
      try { items = JSON.parse(o.itemsJson || "[]"); } catch {}
      return {
        id: o.id,
        channelOrderId: o.channelOrderId,
        channelLabel: c?.label ?? o.connectionId,
        marketplaceUrl: baseUrl ? `${baseUrl}/mmp/shop/order/${o.channelOrderId}` : null,
        state: o.state,
        rawState: o.rawState,
        bucket: bucketOf(o.rawState),
        customerName: o.customerName,
        totalPrice: o.totalPrice,
        channelCreatedAt: o.channelCreatedAt,
        items,
        shopifyOrderId: o.shopifyOrderId,
        trackingNumber: o.trackingNumber,
        carrier: o.carrier,
      };
    });

    const filtered = q.bucket === "all" ? enriched : enriched.filter((e) => e.bucket === q.bucket);
    const total = filtered.length;
    const start = (q.page - 1) * q.pageSize;
    const rows = filtered.slice(start, start + q.pageSize);

    const counts: Record<string, number> = { all: enriched.length, pending: 0, to_accept: 0, to_ship: 0, shipped: 0, closed: 0 };
    for (const e of enriched) if (counts[e.bucket] !== undefined) counts[e.bucket]++;

    return { total, page: q.page, pages: Math.ceil(total / q.pageSize), counts, rows };
  });
}
