import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  publicUrl: process.env.PUBLIC_BACKEND_URL ?? "https://marketplace-hub-production-059e.up.railway.app",
  shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? "",
  jwtSecret: process.env.JWT_SECRET!,
  encryptionKey: process.env.ENCRYPTION_KEY!,
};

for (const [k, v] of Object.entries(config)) {
  if (v === undefined || v === "") throw new Error(`Missing config: ${k}`);
}