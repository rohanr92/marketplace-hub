import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    tenantId: string;
    impersonatedBy?: string;
    readOnly?: boolean;
  }
}

export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing token" });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.userId = payload.userId;
    req.tenantId = payload.tenantId;
    req.impersonatedBy = payload.impersonatedBy;
    req.readOnly = payload.readOnly ?? false;
  } catch {
    return reply.code(401).send({ error: "Invalid token" });
  }
}
