import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { verifyPassword, signToken, hashPassword } from "../lib/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string() })
      .parse(req.body);

    const user = await db.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.password))) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, tenantId: user.tenantId });
    const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
    return { token, user: { id: user.id, email: user.email, role: user.role, isSuperAdmin: user.isSuperAdmin }, tenant };
  });

  app.post("/auth/signup", async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        companyName: z.string().min(1),
      })
      .parse(req.body);

    const existing = await db.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.code(409).send({ error: "An account with this email already exists" });
    }

    const tenant = await db.tenant.create({ data: { name: body.companyName } });
    const user = await db.user.create({
      data: {
        email: body.email,
        password: await hashPassword(body.password),
        role: "owner",
        tenantId: tenant.id,
      },
    });

    const token = signToken({ userId: user.id, tenantId: user.tenantId });
    return { token, user: { id: user.id, email: user.email, role: user.role, isSuperAdmin: user.isSuperAdmin }, tenant };
  });
}
