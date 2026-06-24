import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../lib/db.js";
import { config } from "../lib/config.js";
import { refreshCatalogFromShopify, skuForInventoryItem, syncAllChannelsForTenant } from "../services/syncEngine.js";
import { pushFulfillmentToMirakl } from "../services/fulfillmentSync.js";

// In-memory dedupe of recent webhook ids (per process).
const seen = new Map<string, number>();
function alreadySeen(id?: string) {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 10 * 60 * 1000) seen.delete(k);
  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}

export async function webhookRoutes(app: FastifyInstance) {

// Shopify inventory_levels/update -> refresh that item, then push to marketplaces.
  app.post("/webhooks/shopify/inventory", async (req, reply) => {
    const hmac = req.headers["x-shopify-hmac-sha256"] as string | undefined;
    const shopDomain = req.headers["x-shopify-shop-domain"] as string | undefined;
    const webhookId = req.headers["x-shopify-webhook-id"] as string | undefined;
    const raw: Buffer = (req as any).rawBody ?? Buffer.from("");

    // Verify HMAC (base64) against raw body using the webhook secret.
    const secret = config.shopifyWebhookSecret;
    if (!secret) { reply.code(500).send("Webhook secret not configured"); return; }
    const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    const ok = hmac && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
    if (!ok) { reply.code(401).send("Invalid HMAC"); return; }

    // Respond fast; do the work after.
    reply.code(200).send("ok");

    if (alreadySeen(webhookId)) return;

    const payload = req.body as any; // { inventory_item_id, location_id, available }
    const invItemId = payload?.inventory_item_id;
    if (!invItemId || !shopDomain) return;

    // Find the tenant whose Shopify connection matches this shop domain.
    setImmediate(async () => {
      try {
        const conns = await db.connection.findMany({ where: { type: "shopify" } });
        const conn = conns.find((c) => c.baseUrl.includes(shopDomain.replace(".myshopify.com", "")));
        if (!conn) return;
        const tenantId = conn.tenantId;

        const sku = await skuForInventoryItem(tenantId, invItemId);
        if (sku) {
          await refreshCatalogFromShopify(tenantId, [sku]);
          // surgical: push ONLY the changed SKU to marketplaces, not the whole catalog
          await syncAllChannelsForTenant(tenantId, [sku]);
        } else {
          await refreshCatalogFromShopify(tenantId); // fallback: refresh all tracked
          await syncAllChannelsForTenant(tenantId);
        }
        app.log.info(`[webhook] inventory change for ${sku ?? invItemId} synced to marketplaces`);
      } catch (e: any) {
        app.log.error(`[webhook] processing failed: ${e.message}`);
      }
    });
  });
  // Shopify fulfillments/create -> push tracking to Mirakl (OR23 + OR24).
  app.post("/webhooks/shopify/fulfillment", async (req, reply) => {
    const hmac = req.headers["x-shopify-hmac-sha256"] as string | undefined;
    const shopDomain = req.headers["x-shopify-shop-domain"] as string | undefined;
    const webhookId = req.headers["x-shopify-webhook-id"] as string | undefined;
    const raw: Buffer = (req as any).rawBody ?? Buffer.from("");

    const secret = config.shopifyWebhookSecret;
    if (!secret) { reply.code(500).send("Webhook secret not configured"); return; }
    const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    const ok = hmac && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
    if (!ok) { reply.code(401).send("Invalid HMAC"); return; }

    reply.code(200).send("ok");
    if (alreadySeen(webhookId)) return;

    const payload = req.body as any; // fulfillment: { order_id, tracking_number, tracking_company, ... }
    const shopifyOrderNumericId = payload?.order_id;
    if (!shopifyOrderNumericId || !shopDomain) return;

    setImmediate(async () => {
      try {
        const conns = await db.connection.findMany({ where: { type: "shopify" } });
        const conn = conns.find((c) => c.baseUrl.includes(shopDomain.replace(".myshopify.com", "")));
        if (!conn) return;
        const tenantId = conn.tenantId;

        // Match the hub order by the stored Shopify GID (ends with the numeric id).
        const gidSuffix = String(shopifyOrderNumericId);
        const order = await db.order.findFirst({
          where: { tenantId, shopifyOrderId: { endsWith: gidSuffix } },
        });
        if (!order) { app.log.warn(`[webhook] fulfillment: no hub order for Shopify ${gidSuffix}`); return; }

        const r = await pushFulfillmentToMirakl(order.id, tenantId);
        if (r.skipped) app.log.info(`[webhook] fulfillment skipped: ${r.reason}`);
        else app.log.info(`[webhook] fulfillment ${order.channelOrderId}: tracking ${r.tracking} -> Mirakl SHIPPED`);
      } catch (e: any) {
        app.log.error(`[webhook] fulfillment processing failed: ${e.message}`);
      }
    });
  });

}
