import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.fastifyIntegration({
        // Capture server errors (5xx). Skip expected 4xx noise.
        shouldHandleError(_error, _request, reply) {
          return (reply as any).statusCode >= 500;
        },
      }),
    ],
  });
  console.log("[sentry] error tracking enabled");
} else {
  console.log("[sentry] SENTRY_DSN not set - error tracking disabled");
}
