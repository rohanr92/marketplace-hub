import * as Sentry from "@sentry/node";

// Initialize Sentry as early as possible, before any other imports run.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1, // 10% of requests traced; raise if you want more detail
  });
  console.log("[sentry] error tracking enabled");
} else {
  console.log("[sentry] SENTRY_DSN not set - error tracking disabled");
}
