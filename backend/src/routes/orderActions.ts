import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { acceptMiraklOrder, refuseMiraklOrder, fetchMiraklOrderById } from "../services/mirakl.js";
import { pushOrderToShopify } from "../services/orderPush.js";
import { pushFulfillmentToMirakl } from "../services/fulfillmentSync.js";

export async function orderActionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.post("/orders/:id/accept", async (req: any) => {
    const order = await db.order.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!order) return { ok: false, error: "Order not found" };
    const conn = await db.connection.findUnique({ where: { id: order.connectionId } });
    if (!conn) return { ok: false, error: "Connection missing" };
    const raw = await fetchMiraklOrderById(conn, order.channelOrderId);
    const lineIds = (raw?.order_lines ?? []).map((l: any) => l.order_line_id ?? l.id).filter(Boolean);
    await acceptMiraklOrder(conn, order.channelOrderId, lineIds);
    await db.order.update({ where: { id: order.id }, data: { rawState: "WAITING_DEBIT", state: "payment_pending" } });
    return { ok: true };
  });

  app.post("/orders/:id/refuse", async (req: any) => {
    const order = await db.order.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!order) return { ok: false, error: "Order not found" };
    const conn = await db.connection.findUnique({ where: { id: order.connectionId } });
    if (!conn) return { ok: false, error: "Connection missing" };
    const raw = await fetchMiraklOrderById(conn, order.channelOrderId);
    const lineIds = (raw?.order_lines ?? []).map((l: any) => l.order_line_id ?? l.id).filter(Boolean);
    await refuseMiraklOrder(conn, order.channelOrderId, lineIds);
    await db.order.update({ where: { id: order.id }, data: { rawState: "REFUSED", state: "refused" } });
    return { ok: true };
  });

  app.post("/orders/:id/push", async (req: any) => {
    const r = await pushOrderToShopify(req.params.id, req.tenantId);
    return { ok: true, ...r };
  });

  app.post("/orders/:id/ship-to-marketplace", async (req: any) => {
    const r = await pushFulfillmentToMirakl(req.params.id, req.tenantId);
    return { ok: true, ...r };
  });
}
