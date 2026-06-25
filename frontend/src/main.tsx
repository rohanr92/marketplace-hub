import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./styles.css";

// Error tracking: reports browser/client errors to Sentry.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

// Wrap App so React render errors are caught and reported with a fallback screen.
const SentryApp = SENTRY_DSN
  ? Sentry.withErrorBoundary(App, {
      fallback: <div style={{ padding: 24, fontFamily: "system-ui" }}>Something went wrong. The team has been notified.</div>,
    })
  : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SentryApp />
  </React.StrictMode>
);
