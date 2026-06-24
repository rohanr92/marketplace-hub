import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

function when(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Build the list of recipients you can send to (everyone except your own shop).
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

export default function Messages() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [active, setActive] = useState<any>(null);
  const [thread, setThread] = useState<any>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  function loadInbox() {
    setLoading(true);
    api.inbox()
      .then((d: any) => setItems(d.items ?? []))
      .catch((e: any) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(loadInbox, []);

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
        // default: select all available recipients
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
    api.replyThread(active.threadId, { orderId: active.orderRowId, body: reply.trim(), to })
      .then(() => { setReply(""); openThread(active); loadInbox(); })
      .catch((e: any) => setErr(e.message))
      .finally(() => setSending(false));
  }

  return (
    <Shell>
      <div style={{ padding: 24 }}>
        <h1 style={{ color: "#f2f3f5", fontSize: 22, margin: "0 0 20px" }}>Messages</h1>
        {err ? <div style={{ color: "#ff6b6b", marginBottom: 12 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 16, height: "calc(100vh - 140px)" }}>

          <div style={{ width: 360, background: "#15161b", border: "1px solid #26272f", borderRadius: 12, overflowY: "auto" }}>
            {loading ? (
              <div style={{ color: "#8b8d98", padding: 16 }}>Loading inbox...</div>
            ) : items.length === 0 ? (
              <div style={{ color: "#6b6d78", padding: 16 }}>No messages.</div>
            ) : (
              items.map((it) => (
                <div key={it.threadId} onClick={() => openThread(it)}
                  style={{
                    padding: "12px 14px", borderBottom: "1px solid #26272f", cursor: "pointer",
                    background: active?.threadId === it.threadId ? "#1c1d24" : "transparent",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#f2f3f5", fontSize: 14, fontWeight: 600 }}>{it.topic}</span>
                    {it.replyNeeded ? (
                      <span style={{ background: "#3a1f1f", color: "#ff8080", fontSize: 11, padding: "2px 7px", borderRadius: 6 }}>Reply needed</span>
                    ) : null}
                  </div>
                  <div style={{ color: "#8b8d98", fontSize: 12, marginTop: 4 }}>{it.channelOrderId} &middot; {it.channel}</div>
                  <div style={{ color: "#6b6d78", fontSize: 11, marginTop: 3 }}>Last: {it.lastSender} &middot; {when(it.lastMessageDate)}</div>
                </div>
              ))
            )}
          </div>

          <div style={{ flex: 1, background: "#15161b", border: "1px solid #26272f", borderRadius: 12, display: "flex", flexDirection: "column" }}>
            {!active ? (
              <div style={{ color: "#6b6d78", padding: 24 }}>Select a message to view.</div>
            ) : (
              <>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #26272f" }}>
                  <div style={{ color: "#f2f3f5", fontSize: 16, fontWeight: 600 }}>{active.topic}</div>
                  <div style={{ color: "#8b8d98", fontSize: 12, marginTop: 3 }}>Order {active.channelOrderId}</div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                  {threadLoading ? (
                    <div style={{ color: "#8b8d98" }}>Loading thread...</div>
                  ) : (
                    (thread?.messages ?? []).map((m: any) => {
                      const mine = m.from?.type === "SHOP_USER" || m.from?.type === "SHOP";
                      return (
                        <div key={m.id} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                          <div style={{ color: "#8b8d98", fontSize: 11, marginBottom: 4 }}>
                            {m.from?.display_name ?? "Unknown"} &middot; {when(m.date_created)}
                          </div>
                          <div style={{
                            maxWidth: "75%", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5,
                            background: mine ? "#1d2a1d" : "#1c1d24",
                            color: "#e0e1e6", padding: "10px 14px", borderRadius: 10, border: "1px solid #2a2b33",
                          }}>{m.body}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ borderTop: "1px solid #26272f", padding: 14 }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: 10, alignItems: "center" }}>
                    <span style={{ color: "#8b8d98", fontSize: 12 }}>Send to:</span>
                    {recipients.length === 0 ? (
                      <span style={{ color: "#6b6d78", fontSize: 12 }}>No available recipients</span>
                    ) : recipients.map((r) => {
                      const key = r.type + (r.id ?? "");
                      return (
                        <label key={key} style={{ color: "#d8d9e0", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={!!selected[key]} onChange={() => toggle(key)} />
                          {r.label} <span style={{ color: "#6b6d78", fontSize: 11 }}>({r.type === "OPERATOR" ? "Macy's" : r.type === "CUSTOMER" ? "Customer" : r.type})</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)}
                      placeholder="Type a reply..."
                      style={{
                        flex: 1, resize: "none", height: 60, background: "#0f1014", color: "#e0e1e6",
                        border: "1px solid #303139", borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "inherit",
                      }} />
                    <button onClick={send} disabled={sending || !reply.trim()}
                      style={{
                        background: sending || !reply.trim() ? "#3a3b44" : "#c9a227",
                        color: "#15161b", border: "none", borderRadius: 8, padding: "0 20px",
                        fontWeight: 600, cursor: sending || !reply.trim() ? "default" : "pointer",
                      }}>{sending ? "Sending..." : "Send"}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
