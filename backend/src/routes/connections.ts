import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { encrypt } from "../lib/crypto.js";
import { authGuard } from "../middleware/authGuard.js";
import { testMiraklConnection } from "../services/mirakl.js";
import { testShopifyConnection, fetchShopifyLocations } from "../services/shopify.js";

function normDomain(s: string) {
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
}

export async function connectionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/connections", async (req) => {
    const rows = await db.connection.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((c) => ({
      id: c.id, type: c.type, label: c.label, baseUrl: c.baseUrl,
      active: c.active, syncEnabled: c.syncEnabled, matchStrategy: c.matchStrategy,
      locationId: c.locationId, lastSyncAt: c.lastSyncAt, hasKey: !!c.apiKeyEnc,
    }));
  });

  app.post("/connections", async (req, reply) => {
    const body = z.object({
      type: z.enum(["mirakl", "shopify"]),
      label: z.string().min(1),
      baseUrl: z.string().min(1),
      apiKey: z.string().min(1),
    }).parse(req.body);

    const baseUrl = body.type === "shopify" ? normDomain(body.baseUrl) : body.baseUrl.replace(/\/$/, "");

    // Prevent adding the same store/marketplace twice for this tenant
    const existing = await db.connection.findFirst({
      where: { tenantId: req.tenantId, type: body.type, baseUrl },
    });
    if (existing) {
      return reply.code(409).send({ error: "This channel is already connected." });
    }

    const created = await db.connection.create({
      data: {
        tenantId: req.tenantId, type: body.type, label: body.label,
        baseUrl, apiKeyEnc: encrypt(body.apiKey),
      },
    });
    return reply.code(201).send({ id: created.id });
  });

  app.patch("/connections/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    const b = z.object({
      syncEnabled: z.boolean().optional(),
      matchStrategy: z.enum(["upc", "sku", "manual"]).optional(),
      active: z.boolean().optional(),
      locationId: z.string().optional(),
    }).parse(req.body);
    const updated = await db.connection.update({ where: { id }, data: b });
    req.log.info({ id, locationId: updated.locationId }, "connection patched");
    return {
      id: updated.id, syncEnabled: updated.syncEnabled,
      matchStrategy: updated.matchStrategy, active: updated.active,
      locationId: updated.locationId,
    };
  });

  app.get("/connections/:id/locations", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({
      where: { id, tenantId: req.tenantId, type: "shopify" },
    });
    if (!conn) return reply.code(404).send({ error: "Shopify connection not found" });
    try {
      const locations = await fetchShopifyLocations(conn);
      req.log.info({ count: locations.length }, "fetched locations");
      return { locations };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post("/connections/:id/test", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    try {
      const result = conn.type === "mirakl"
        ? await testMiraklConnection(conn) : await testShopifyConnection(conn);
      return { ok: true, detail: result };
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err.message ?? "Test failed" });
    }
  });

  app.delete("/connections/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    await db.connection.delete({ where: { id } });
    return { ok: true };
  });
}
