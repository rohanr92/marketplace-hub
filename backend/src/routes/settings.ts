import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { hashPassword } from "../lib/auth.js";
// requireOwnerOrAdmin enforced via preHandler below

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // Role guard: only owner/admin may touch company settings or users.
  app.addHook("preHandler", async (req: any, reply: any) => {
    const me = await db.user.findUnique({ where: { id: req.userId } });
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      return reply.code(403).send({ error: "Forbidden: requires owner or admin role" });
    }
  });

  // Get company profile
  app.get("/settings/company", async (req) => {
    const t = await db.tenant.findUnique({ where: { id: req.tenantId } });
    if (!t) return { error: "Not found" };
    return {
      id: t.id, name: t.name, logoBase64: t.logoBase64, timezone: t.timezone,
      ein: t.ein, sellerName: t.sellerName, sellerEmail: t.sellerEmail, sellerPhone: t.sellerPhone,
      returnAddress: t.returnAddress, shippingAddress: t.shippingAddress,
    };
  });

  // Update company profile
  app.patch("/settings/company", async (req) => {
    const body = z.object({
      name: z.string().min(1).optional(),
      logoBase64: z.string().nullable().optional(),
      timezone: z.string().nullable().optional(),
      ein: z.string().nullable().optional(),
      sellerName: z.string().nullable().optional(),
      sellerEmail: z.string().nullable().optional(),
      sellerPhone: z.string().nullable().optional(),
      returnAddress: z.string().nullable().optional(),
      shippingAddress: z.string().nullable().optional(),
    }).parse(req.body);
    const t = await db.tenant.update({ where: { id: req.tenantId }, data: body });
    return { ok: true, name: t.name };
  });

  // List users in this company
  app.get("/settings/users", async (req) => {
    const users = await db.user.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { users };
  });

  // Add a user to this company
  app.post("/settings/users", async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["owner", "admin", "staff"]).default("staff"),
    }).parse(req.body);
    const existing = await db.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: "Email already in use" });
    const u = await db.user.create({
      data: {
        email: body.email,
        password: await hashPassword(body.password),
        role: body.role,
        tenantId: req.tenantId,
      },
    });
    return { ok: true, user: { id: u.id, email: u.email, role: u.role } };
  });

  // Remove a user (cannot remove yourself)
  app.delete("/settings/users/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.userId) return reply.code(400).send({ error: "You cannot remove yourself" });
    const u = await db.user.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!u) return reply.code(404).send({ error: "User not found" });
    await db.user.delete({ where: { id } });
    return { ok: true };
  });
}
