import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  publicUrl: process.env.PUBLIC_BACKEND_URL ?? "https://marketplace-hub-production-059e.up.railway.app",
  shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? "",
  jwtSecret: process.env.JWT_SECRET!,
  encryptionKey: process.env.ENCRYPTION_KEY!,
  // Shopify public app (OAuth). Optional so existing deploys don't crash if unset.
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID ?? "",
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
  shopifyAppScopes: process.env.SHOPIFY_APP_SCOPES ?? "read_products,write_products,read_inventory,write_inventory,read_orders,write_orders,read_fulfillments,write_fulfillments,read_locations",
  frontendUrl: process.env.FRONTEND_URL ?? "https://marketplace-hub-gold.vercel.app",
};

const REQUIRED = ["port", "publicUrl", "jwtSecret", "encryptionKey"];
for (const [k, v] of Object.entries(config)) {
  if (REQUIRED.includes(k) && (v === undefined || v === "")) {
    throw new Error(`Missing config: ${k}`);
  }
}