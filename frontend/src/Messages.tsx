import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

function when(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  return sameDay
    ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : dt.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Safely render a Mirakl message body that may contain HTML (<br>, <b>, links, etc.)
// We strip scripts/styles/on* handlers and only keep basic formatting tags.
function sanitizeHtml(raw: string): string {
  if (!raw) return "";
  let html = raw;
  // remove script/style blocks entirely
  html = html.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // remove any on*="..." event handlers
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // neutralize javascript: urls
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*("|')/gi, '$1="#"');
  // strip any tag that is not in our allowlist
  const allowed = new Set(["br", "b", "strong", "i", "em", "u", "p", "ul", "ol", "li", "a", "span", "div"]);
  html = html.replace(/<\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (m, tag) => {
    return allowed.has(String(tag).toLowerCase()) ? m : "";
  });
  return html;
}

// Convert a user's plain-text reply (with newlines) into HTML with <br> so it
// formats correctly on the marketplace/customer side.
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\n/g, "<br />");
}

function channelBrand(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("nordstrom")) return { short: "NORD", bg: "#000" };
  if (n.includes("macy")) return { short: "MACY'S", bg: "#e21a2c" };
  if (n.includes("kohl")) return { short: "KOHL'S", bg: "#000" };
  return { short: (name || "?").replace(/\s*-\s*.*/, "").slice(0, 6).toUpperCase(), bg: "#3b5bfd" };
}

function recipientOptions(thread: any) {
  const seen = new Map<string, { id?: string; type: string; label: string }>();
  const pools = [thread?.current_participants ?? [], thread?.authorized_participants ?? []];
  for (const pool of pools) {
    for (const p of pool) {
      if (p.type === "SHOP" || p.type === "SHOP_USER") continue;
      const key = p.type + (p.id ?? "");
      if (!seen.has(key)) seen.set(key, { id: p.id, type: p.type, label: p.display_name ?? p.type });
    }
  }
  return [...seen.values()];
}

const RANGES = [
  ["60", "Last 60 days"],
  ["180", "Last 180 days"],
  ["365", "Last year"],
];

export default function Messages() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [days, setDays] = useState("60");
  const [active, setActive] = useState<any>(null);
  const [thread, setThread] = useState<any>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  function loadInbox() {
    setLoading(true);
    api.inbox({ days: Number(days) })
      .then((d: any) => setItems(d.items ?? []))
      .catch((e: any) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(loadInbox, [days]);

  function openThread(it: any) {
    setActive(it);
    setThread(null);
    setReply("");
    setThreadLoading(true);
    api.getThread(it.threadId, it.orderRowId)
      .then((d: any) => {
        setThread(d.thread);
        const opts = recipientOptions(d.thread);
        setRecipients(opts);
        const sel: Record<string, boolean> = {};
        opts.forEach((o) => { sel[o.type + (o.id ?? "")] = true; });
        setSelected(sel);
      })
      .catch((e: any) => setErr(e.message))
      .finally(() => setThreadLoading(false));
  }

  function toggle(key: string) {
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  }

  function send() {
    if (!reply.trim() || !active) return;
    const to = recipients
      .filter((r) => selected[r.type + (r.id ?? "")])
      .map((r) => ({ id: r.id, type: r.type }));
    if (to.length === 0) { setErr("Select at least one recipient."); return; }
    setErr("");
    setSending(true);
    api.replyThread(active.threadId, { orderId: active.orderRowId, body: textToHtml(reply.trim()), to })
      .then(() => { setReply(""); openThread(active); loadInbox(); })
      .catch((e: any) => setErr(e.message))
      .finally(() => setSending(false));
  }

  const replyNeededCount = items.filter((i) => i.replyNeeded).length;
  const shown = filter === "REPLY" ? items.filter((i) => i.replyNeeded) : items;

  return (
    <Shell>
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>Messages</h2>
          <div className="conn-sub" style={{ marginTop: 4 }}>Customer & marketplace conversations</div>
        </div>
        <select value={days} onChange={(e) => setDays(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #e6e8ee", borderRadius: 8, fontSize: 13, background: "#fff", color: "#1a2233", cursor: "pointer" }}>
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {err && <div className="toast bad" style={{ marginBottom: 14 }}>{err}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["ALL", "All", items.length], ["REPLY", "Reply needed", replyNeededCount]].map(([k, label, n]) => {
          const activeTab = filter === k;
          return (
            <button key={k as string} onClick={() => setFilter(k as string)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: activeTab ? "1px solid #3b5bfd" : "1px solid #e6e8ee",
                background: activeTab ? "#3b5bfd" : "#fff",
                color: activeTab ? "#fff" : "#1a2233",
              }}>
              {label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                background: activeTab ? "rgba(255,255,255,.22)" : (k === "REPLY" && (n as number) > 0 ? "#fde8e8" : "#eceef2"),
                color: activeTab ? "#fff" : (k === "REPLY" && (n as number) > 0 ? "#dc2626" : "#6b7488"),
              }}>{n as number}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, height: "calc(100vh - 250px)", minHeight: 440 }}>
        <div className="card" style={{ width: 340, padding: 0, overflowY: "auto", flexShrink: 0 }}>
          {loading ? (
            <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
              <div className="spinner" /><span>Loading inbox...</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">{filter === "REPLY" ? "No messages need a reply." : "No messages in this range."}</div>
          ) : (
            shown.map((it) => {
              const b = channelBrand(it.channel);
              const isActive = active?.threadId === it.threadId;
              return (
                <div key={it.threadId} onClick={() => openThread(it)}
                  style={{
                    padding: "13px 15px", borderBottom: "1px solid #eef0f4", cursor: "pointer",
                    background: isActive ? "#eef1ff" : "transparent",
                    borderLeft: isActive ? "3px solid #3b5bfd" : "3px solid transparent",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 46, height: 20, padding: "0 6px", borderRadius: 5,
                      background: b.bg, color: "#fff", fontSize: 9, fontWeight: 800, flexShrink: 0,
                    }}>{b.short}</span>
                    <span style={{ fontSize: 11, color: "#8a92a3", marginLeft: "auto" }}>{when(it.lastMessageDate)}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a2233", marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.topic}
                  </div>
                  <div style={{ color: "#6b7488", fontSize: 12, marginTop: 3 }}>#{it.channelOrderId}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7 }}>
                    <span style={{ color: "#8a92a3", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>
                      {it.lastSender || "-"}
                    </span>
                    {it.replyNeeded && (
                      <span style={{ background: "#fde8e8", color: "#dc2626", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>
                        Reply needed
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ flex: 1, padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!active ? (
            <div className="empty" style={{ margin: "auto", textAlign: "center", color: "#8a92a3" }}>
              Select a conversation to view messages
            </div>
          ) : (
            <>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #eef0f4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2233" }}>{active.topic}</div>
                  <div style={{ color: "#6b7488", fontSize: 12, marginTop: 3 }}>{active.channel} - Order #{active.channelOrderId}</div>
                </div>
                {(() => { const b = channelBrand(active.channel); return (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 54, height: 26, padding: "0 8px", borderRadius: 6, background: b.bg, color: "#fff", fontSize: 11, fontWeight: 800 }}>{b.short}</span>
                ); })()}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 20, background: "#fafbfc" }}>
                {threadLoading ? (
                  <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
                    <div className="spinner" /><span>Loading conversation...</span>
                  </div>
                ) : (thread?.messages ?? []).length === 0 ? (
                  <div className="empty">No messages in this thread.</div>
                ) : (
                  (thread?.messages ?? []).map((m: any) => {
                    const mine = m.from?.type === "SHOP_USER" || m.from?.type === "SHOP";
                    return (
                      <div key={m.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ color: "#8a92a3", fontSize: 11, marginBottom: 5, padding: "0 4px" }}>
                          {m.from?.display_name ?? "Unknown"} - {when(m.date_created)}
                        </div>
                        <div
                          style={{
                            maxWidth: "72%", fontSize: 13.5, lineHeight: 1.55,
                            background: mine ? "#3b5bfd" : "#fff",
                            color: mine ? "#fff" : "#1a2233",
                            padding: "11px 15px", borderRadius: 14,
                            borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                            border: mine ? "none" : "1px solid #e6e8ee",
                            boxShadow: "0 1px 2px rgba(16,24,40,.04)",
                            wordBreak: "break-word",
                          }}
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.body) }}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ borderTop: "1px solid #eef0f4", padding: "14px 16px", background: "#fff" }}>
                {recipients.length > 0 && (
                  <div style={{ display: "flex", gap: 14, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "#6b7488", fontSize: 12, fontWeight: 600 }}>To:</span>
                    {recipients.map((r) => {
                      const key = r.type + (r.id ?? "");
                      const nice = r.type === "OPERATOR" ? "Marketplace" : r.type === "CUSTOMER" ? "Customer" : r.label;
                      return (
                        <label key={key} style={{ color: "#1a2233", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={!!selected[key]} onChange={() => toggle(key)} />
                          {nice}
                        </label>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your reply..."
                    style={{
                      flex: 1, resize: "none", height: 58, background: "#fff", color: "#1a2233",
                      border: "1px solid #e6e8ee", borderRadius: 10, padding: "11px 13px", fontSize: 13.5, fontFamily: "inherit",
                    }} />
                  <button className="btn" onClick={send} disabled={sending || !reply.trim()}
                    style={{ height: 44, opacity: sending || !reply.trim() ? 0.5 : 1 }}>
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
