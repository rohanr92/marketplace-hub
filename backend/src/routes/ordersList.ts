import { FastifyInstance } from "fastify";
import { classifyOrderItems } from "../lib/category.js";
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
      category: z.enum(["all", "clothing", "footwear"]).default("all"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
      search: z.string().optional(),
    }).parse(req.query);

    const orders = await db.order.findMany({ where: { tenantId: req.tenantId }, orderBy: { channelCreatedAt: "desc" } });
    const conns = await db.connection.findMany({ where: { tenantId: req.tenantId } });
    const connById = new Map(conns.map((c) => [c.id, c]));
    const shopifyConn = conns.find((c) => c.type === "shopify");
    const shopDomain = shopifyConn?.baseUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "";

    const enriched = orders.map((o) => {
      const c = connById.get(o.connectionId);
      const baseUrl = c?.baseUrl ?? "";
      let items: any[] = [];
      try { items = JSON.parse(o.itemsJson || "[]"); } catch {}
      return {
        id: o.id, channelOrderId: o.channelOrderId, channelLabel: c?.label ?? o.connectionId,
        marketplaceUrl: baseUrl ? `${baseUrl}/mmp/shop/order/${o.channelOrderId}` : null,
        state: o.state, rawState: o.rawState, bucket: bucketOf(o.rawState),
        category: classifyOrderItems(items),
        customerName: o.customerName, totalPrice: o.totalPrice, channelCreatedAt: o.channelCreatedAt, items,
        shopifyOrderId: o.shopifyOrderId,
        shopifyOrderUrl: o.shopifyOrderId && shopDomain
          ? `https://${shopDomain.replace(".myshopify.com", "")}.myshopify.com/admin/orders/${String(o.shopifyOrderId).replace(/\D/g, "")}`
          : null,
        trackingNumber: o.trackingNumber, carrier: o.carrier,
      };
    });

    let filtered = enriched;
    if (q.bucket !== "all") filtered = filtered.filter((e) => e.bucket === q.bucket);
    if (q.category !== "all") filtered = filtered.filter((e) => e.category === q.category);
    if (q.search && q.search.trim()) {
      const needle = q.search.trim().toLowerCase();
      filtered = filtered.filter((e) => {
        const dateStr = e.channelCreatedAt ? new Date(e.channelCreatedAt).toISOString().slice(0, 10) : "";
        const itemStr = (e.items ?? []).map((i: any) => `${i.sku ?? ""} ${i.title ?? ""}`).join(" ");
        return [e.channelOrderId, e.customerName ?? "", e.channelLabel ?? "", dateStr, itemStr, e.trackingNumber ?? ""]
          .join(" ").toLowerCase().includes(needle);
      });
    }

    const total = filtered.length;
    const start = (q.page - 1) * q.pageSize;
    const rows = filtered.slice(start, start + q.pageSize);

    const counts: Record<string, number> = { all: enriched.length, pending: 0, to_accept: 0, to_ship: 0, shipped: 0, closed: 0 };
    for (const e of enriched) if (counts[e.bucket] !== undefined) counts[e.bucket]++;
    const categoryCounts = {
      all: enriched.length,
      clothing: enriched.filter((e) => e.category === "clothing").length,
      footwear: enriched.filter((e) => e.category === "footwear").length,
    };

    return { total, page: q.page, pages: Math.ceil(total / q.pageSize), counts, categoryCounts, rows };
  });
}
