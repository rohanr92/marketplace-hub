import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

const API_BASE = import.meta.env.VITE_API_URL as string;

type Conn = {
  id: string; type: "mirakl" | "shopify"; label: string;
  baseUrl: string; active: boolean; locationId: string | null;
};

export default function Connections() {
  const [rows, setRows] = useState<Conn[]>([]);
  const [open, setOpen] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Record<string, any[]>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});

  const [shopifyBanner, setShopifyBanner] = useState("");
  async function load() { setRows(await api.listConnections()); }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("shopify") === "connected") {
      setShopifyBanner("Shopify store connected. Catalog import and webhooks are set up.");
      window.history.replaceState({}, "", "/connections");
    }
  }, []);

  async function test(id: string) {
    setTestResult((p) => ({ ...p, [id]: "testing" }));
    try {
      const r = await api.testConnection(id);
      setTestResult((p) => ({ ...p, [id]: "ok:" + (r.detail?.shopName ?? "connected") }));
    } catch (e: any) {
      setTestResult((p) => ({ ...p, [id]: "bad:" + e.message }));
    }
  }

  async function loadLocations(id: string) {
    setLocations((p) => ({ ...p, [id]: [] }));
    try {
      const r = await api.listLocations(id);
      setLocations((p) => ({ ...p, [id]: r.locations }));
    } catch (e: any) {
      alert("Could not load locations: " + e.message);
      setLocations((p) => { const c = { ...p }; delete c[id]; return c; });
    }
  }

  async function pickLocation(id: string, locationId: string) {
    if (!locationId) return;
    // optimistic update so the dropdown keeps its value
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, locationId } : r));
    try {
      const res = await api.updateConnection(id, { locationId });
      const name = (locations[id] ?? []).find((l) => l.id === res.locationId)?.name ?? "saved";
      setSavedMsg((p) => ({ ...p, [id]: `Location set: ${name}` }));
    } catch (e: any) {
      setSavedMsg((p) => ({ ...p, [id]: "Save failed: " + e.message }));
      load();
    }
  }

  function connectShopifyApp() {
    const shop = prompt("Enter the Shopify store domain (e.g. brand.myshopify.com):");
    if (!shop) return;
    const clean = shop.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)) {
      alert("Please enter a valid .myshopify.com domain");
      return;
    }
    const tok = localStorage.getItem("token") ?? "";
    // Browser redirect to the backend install route (carries Hub token in query).
    window.location.href = `${API_BASE}/shopify/install?shop=${encodeURIComponent(clean)}&token=${encodeURIComponent(tok)}`;
  }

  async function remove(id: string) {
    if (!confirm("Delete this connection?")) return;
    await api.deleteConnection(id);
    load();
  }

  return (
    <Shell>
      <div className="page-head">
        <h2>Channels</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={connectShopifyApp}>Connect Shopify (App)</button>
          <button className="btn" onClick={() => setOpen(true)}>+ Add channel</button>
        </div>
      </div>
      {shopifyBanner && (
        <div className="toast" style={{ marginBottom: 12 }}>{shopifyBanner}</div>
      )}

      <div className="card">
        {rows.length === 0 && <div className="empty">No channels connected yet. Add your first Mirakl marketplace or Shopify store.</div>}
        {rows.map((c) => (
          <div className="conn-row" key={c.id}>
            <div className={"conn-icon " + c.type}>{c.type === "mirakl" ? "MK" : "SH"}</div>
            <div>
              <div className="conn-label">{c.label}</div>
              <div className="conn-sub">{c.baseUrl}</div>
              {c.type === "shopify" && (
                <div style={{ marginTop: 8 }}>
                  {!locations[c.id] ? (
                    <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}
                      onClick={() => loadLocations(c.id)}>
                      {c.locationId ? "Change location" : "Select location"}
                    </button>
                  ) : locations[c.id].length === 0 ? (
                    <span className="conn-sub">Loading locations...</span>
                  ) : (
                    <select className="loc-select" value={c.locationId ?? ""}
                      onChange={(e) => pickLocation(c.id, e.target.value)}>
                      <option value="" disabled>Choose a location...</option>
                      {locations[c.id].map((l: any) => (
                        <option key={l.id} value={l.id}>{l.name}{l.address ? ` — ${l.address}` : ""}</option>
                      ))}
                    </select>
                  )}
                  {c.locationId && !locations[c.id] && (
                    <span className="conn-sub" style={{ marginLeft: 10 }}>✓ Location set</span>
                  )}
                  {savedMsg[c.id] && <div className="toast ok" style={{ marginTop: 6 }}>{savedMsg[c.id]}</div>}
                </div>
              )}
              {testResult[c.id]?.startsWith("ok:") && <div className="toast ok">Connected: {testResult[c.id].slice(3)}</div>}
              {testResult[c.id]?.startsWith("bad:") && <div className="toast bad">{testResult[c.id].slice(4)}</div>}
            </div>
            <div className="conn-actions">
            <span className={"badge " + (c.active ? "green" : "red")}>{c.active ? "Active" : "Inactive"}</span>
            {c.type === "mirakl" && <button className="btn btn-ghost" onClick={() => location.assign("/channels/" + c.id)}>View channel</button>}
            <button className="btn btn-ghost" onClick={() => test(c.id)}>
              {testResult[c.id] === "testing" ? "Testing..." : "Test"}
            </button>
            <button className="btn btn-danger" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {open && <AddModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </Shell>
  );
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"mirakl" | "shopify">("mirakl");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [result, setResult] = useState<string>("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr(""); setResult(""); setSaving(true);
    try {
      const res: any = await api.createConnection(
        type === "shopify"
          ? { type, label, baseUrl, apiKey, webhookSecret: webhookSecret || undefined }
          : { type, label, baseUrl, apiKey }
      );
      // For Shopify, surface whether webhooks auto-registered.
      if (type === "shopify" && res?.webhooks) {
        const w = res.webhooks;
        if (w.errors?.length) {
          setResult("Connected, but webhook setup had issues: " + w.errors.join("; ") +
            ". Check that the access token has webhook + inventory + orders scopes.");
          setSaving(false);
          return; // let them see the warning before closing
        }
        const done = [...(w.created || []), ...(w.existing || [])];
        setResult("Connected. Webhooks active: " + (done.length ? done.join(", ") : "none"));
      }
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add channel</h3>
        <div className="sub">Connect a Mirakl marketplace or a Shopify store. For Shopify, you'll pick the location after connecting.</div>
        <div className="seg">
          <button className={type === "mirakl" ? "active" : ""} onClick={() => setType("mirakl")}>Mirakl</button>
          <button className={type === "shopify" ? "active" : ""} onClick={() => setType("shopify")}>Shopify</button>
        </div>
        <div className="field">
          <label>Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder={type === "mirakl" ? "Nordstrom - Menina Step" : "Menina Step Store"} />
        </div>
        <div className="field">
          <label>{type === "mirakl" ? "Mirakl instance URL" : "Shop domain"}</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={type === "mirakl" ? "https://marketplace.nordstrom.com" : "myshop.myshopify.com"} />
        </div>
        <div className="field">
          <label>{type === "mirakl" ? "API key" : "Admin API access token"}</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="paste secret key" />
        </div>
        {type === "shopify" && (
          <div className="field">
            <label>Shopify webhook secret</label>
            <input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="for instant inventory sync (API secret key)" />
          </div>
        )}
        {err && <div className="toast bad">{err}</div>}
        {result && <div className="toast">{result}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={saving || !label || !baseUrl || !apiKey}>
            {saving ? "Saving..." : "Save channel"}
          </button>
        </div>
      </div>
    </div>
  );
}
