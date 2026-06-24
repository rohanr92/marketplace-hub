import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { signToken, hashPassword } from "../lib/auth.js";

// Only a true super admin (looked up fresh) may use these routes.
async function requireSuperAdmin(req: any, reply: any) {
  const me = await db.user.findUnique({ where: { id: req.userId } });
  if (!me || !me.isSuperAdmin) {
    return reply.code(403).send({ error: "Forbidden: super admin only" });
  }
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", requireSuperAdmin);

  // List every company with stats.
  app.get("/admin/tenants", async () => {
    const tenants = await db.tenant.findMany({ orderBy: { createdAt: "desc" } });
    const out = [];
    for (const t of tenants) {
      const [orders, connections, users] = await Promise.all([
        db.order.count({ where: { tenantId: t.id } }),
        db.connection.count({ where: { tenantId: t.id } }),
        db.user.count({ where: { tenantId: t.id } }),
      ]);
      out.push({
        id: t.id, name: t.name, logoBase64: t.logoBase64, createdAt: t.createdAt,
        orderCount: orders, connectionCount: connections, userCount: users,
      });
    }
    return { tenants: out };
  });

  // Impersonate a company: returns a token scoped to that tenant.
  app.post("/admin/impersonate/:tenantId", async (req: any, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const body = z.object({ readOnly: z.boolean().default(true) }).parse(req.body ?? {});
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return reply.code(404).send({ error: "Company not found" });
    // pick an owner of that tenant to act as (for userId context)
    const target = await db.user.findFirst({ where: { tenantId, role: "owner" } })
      ?? await db.user.findFirst({ where: { tenantId } });
    const token = signToken({
      userId: target?.id ?? req.userId,
      tenantId,
      impersonatedBy: req.userId,
      readOnly: body.readOnly,
    });
    return {
      token,
      tenant: { id: tenant.id, name: tenant.name, logoBase64: tenant.logoBase64 },
      readOnly: body.readOnly,
    };
  });
  // Platform-wide stats across all tenants.
  app.get("/admin/stats", async () => {
    const [companies, orders, connections] = await Promise.all([
      db.tenant.count(),
      db.order.count(),
      db.connection.count(),
    ]);
    const allOrders = await db.order.findMany({ select: { totalPrice: true, state: true } });
    const totalSales = allOrders
      .filter((o) => !["canceled", "refused"].includes(o.state))
      .reduce((sum, o) => sum + (o.totalPrice ?? 0), 0);
    return { companies, orders, connections, totalSales };
  });

  // Create a new company + its owner user (operator onboarding a client).
  app.post("/admin/companies", async (req, reply) => {
    const body = z.object({
      companyName: z.string().min(1),
      ownerEmail: z.string().email(),
      ownerPassword: z.string().min(8),
    }).parse(req.body);
    const existing = await db.user.findUnique({ where: { email: body.ownerEmail } });
    if (existing) return reply.code(409).send({ error: "That owner email is already in use" });
    const tenant = await db.tenant.create({ data: { name: body.companyName } });
    await db.user.create({
      data: {
        email: body.ownerEmail,
        password: await hashPassword(body.ownerPassword),
        role: "owner",
        tenantId: tenant.id,
      },
    });
    return { ok: true, tenant: { id: tenant.id, name: tenant.name } };
  });

  // Change the operator's own password.
  app.patch("/admin/password", async (req: any) => {
    const body = z.object({ newPassword: z.string().min(8) }).parse(req.body);
    await db.user.update({ where: { id: req.userId }, data: { password: await hashPassword(body.newPassword) } });
    return { ok: true };
  });

}
