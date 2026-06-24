import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Shell from "./Shell";
import { api } from "./api";

export default function ChannelSettings() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState<any>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [msg, setMsg] = useState("");

  async function load() {
    setS(await api.channelSettings(id!));
    setCatalog(await api.listCatalog());
  }
  useEffect(() => { load(); }, [id]);

  if (!s) return <Shell><div className="empty">Loading...</div></Shell>;

  async function setMode(mode: string) {
    await api.updateChannelSettings(id!, { mappingMode: mode });
    setS({ ...s, mappingMode: mode });
  }
  async function setSync(on: boolean) {
    await api.updateChannelSettings(id!, { syncEnabled: on });
    setS({ ...s, syncEnabled: on });
  }
  async function setBuffer(v: number) {
    await api.updateChannelSettings(id!, { defaultBuffer: v });
    setS({ ...s, defaultBuffer: v });
  }
  async function addRule(scope: string, value: string, amount: number) {
    await api.addBufferRule(id!, scope, value, amount);
    load();
  }
  async function delRule(ruleId: string) { await api.deleteBufferRule(id!, ruleId); load(); }
  async function mapOffer(offerId: string, catalogItemId: string) {
    await api.mapOffer(id!, offerId, catalogItemId || null);
    load();
  }
  async function makeSampleOffers() { await api.sampleOffers(id!); load(); }

  const modes = [
    { key: "auto_sku", label: "Auto by SKU" },
    { key: "auto_upc", label: "Auto by UPC" },
    { key: "manual", label: "Manual mapping" },
    { key: "full_catalog", label: "Sync full catalog" },
  ];

  return (
    <Shell>
      <div className="page-head">
        <div>
          <button className="link-btn" style={{ color: "var(--brand)", padding: 0 }} onClick={() => nav("/connections")}>← Back to Channels</button>
          <h2 style={{ marginTop: 6 }}>{s.label}</h2>
          <div className="conn-sub">{s.baseUrl}</div>
        </div>
      </div>

      {msg && <div className="toast ok" style={{ marginBottom: 16 }}>{msg}</div>}

      <ReconcilePanel id={id!} mode={s.mappingMode} setMsg={setMsg} refreshKey={refreshKey} />

      <SyncPanel id={id!} syncEnabled={s.syncEnabled} setMsg={setMsg} />

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Inventory sync</div>
            <div className="conn-sub">Turn syncing on/off for this channel.</div>
          </div>
          <button className={"toggle " + (s.syncEnabled ? "on" : "")} onClick={() => setSync(!s.syncEnabled)}><span className="knob" /></button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Mapping mode</div>
        <div className="conn-sub" style={{ marginBottom: 14 }}>How offers on this channel match your catalog.</div>
        <div className="seg">
          {modes.map((m) => (
            <button key={m.key} className={s.mappingMode === m.key ? "active" : ""} onClick={() => setMode(m.key)}>{m.label}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Buffer</div>
        <div className="conn-sub" style={{ marginBottom: 14 }}>Hold back stock so you never oversell. Default applies to all; rules override for specific items.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Default buffer (all items)</label>
          <input type="number" min={0} defaultValue={s.defaultBuffer} className="loc-select" style={{ minWidth: 90 }}
            onBlur={(e) => setBuffer(parseInt(e.target.value) || 0)} />
        </div>
        <RuleAdder onAdd={addRule} />
        {s.rules.length > 0 && (
          <table className="otable" style={{ marginTop: 14 }}>
            <thead><tr><th>Match</th><th>Value</th><th>Buffer</th><th></th></tr></thead>
            <tbody>
              {s.rules.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.scope.toUpperCase()}</td>
                  <td className="mono">{r.value}</td>
                  <td><strong>{r.amount}</strong></td>
                  <td><button className="btn btn-danger" onClick={() => delRule(r.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {s.mappingMode === "manual" && (
        <ManualBulkPanel id={id!} setMsg={setMsg} reload={() => { load(); setRefreshKey((k) => k + 1); }} />
      )}
    </Shell>
  );
}

function RuleAdder({ onAdd }: { onAdd: (scope: string, value: string, amount: number) => void }) {
  const [scope, setScope] = useState("sku");
  const [value, setValue] = useState("");
  const [amount, setAmount] = useState("0");
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Rule type</label>
        <select className="loc-select" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="sku">By SKU</option>
          <option value="upc">By UPC</option>
          <option value="title">By title contains</option>
        </select>
      </div>
      <div className="field" style={{ margin: 0, flex: 1 }}>
        <label>Value</label>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="SKU / UPC / title text" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Buffer</label>
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 90 }} />
      </div>
      <button className="btn" onClick={() => { if (value) { onAdd(scope, value, parseInt(amount) || 0); setValue(""); setAmount("0"); } }}>Add rule</button>
    </div>
  );
}


function ReconcilePanel({ id, mode, setMsg, refreshKey }: { id: string; mode: string; setMsg: (m: string) => void; refreshKey?: number }) {
  const [summary, setSummary] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("unmatched");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  async function loadSummary() {
    try { setSummary(await api.reconcile(id)); } catch {}
  }
  async function loadList(p = page, f = filter) {
    try { setList(await api.channelOffers(id, f, p)); } catch {}
  }

  useEffect(() => { loadSummary(); loadList(1, filter); setPage(1); }, [id, mode, filter, refreshKey]);

  async function pull() {
    setBusy(true); setMsg("");
    try {
      const p = await api.pullOffers(id);
      setMsg(`Pulled ${p.pulled} offers`);
      await loadSummary(); await loadList(1, filter);
    } catch (e: any) { setMsg("Pull failed: " + e.message); } finally { setBusy(false); }
  }

  function go(p: number) { setPage(p); loadList(p, filter); }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Channel offers vs catalog</div>
          <div className="conn-sub">Pull this channel's live offers and match by {mode.replace("_", " ")}.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {mode === "manual" && <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>Bulk map by list</button>}
          <button className="btn" onClick={pull} disabled={busy}>{busy ? "Pulling..." : "Pull offers from channel"}</button>
        </div>
      </div>

      {summary && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <Stat label="Total offers" value={summary.totalOffers} />
          <Stat label="Matched" value={summary.matched} good />
          <Stat label="Unmatched" value={summary.unmatched} bad={summary.unmatched > 0} />
          <Stat label="Catalog items" value={summary.catalogSize} />
        </div>
      )}

      <div className="seg" style={{ maxWidth: 380, marginBottom: 12 }}>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "matched" ? "active" : ""} onClick={() => setFilter("matched")}>Matched</button>
        <button className={filter === "unmatched" ? "active" : ""} onClick={() => setFilter("unmatched")}>Unmatched</button>
      </div>

      {list && list.rows.length > 0 ? (
        <>
          <table className="otable">
            <thead><tr><th>Title</th><th>Offer SKU</th><th>UPC</th><th>Status</th></tr></thead>
            <tbody>
              {list.rows.map((o: any) => (
                <tr key={o.id}>
                  <td>{o.title ?? "-"}</td>
                  <td className="mono">{o.offerSku}</td>
                  <td className="mono">{o.offerUpc ?? "-"}</td>
                  <td>
                    {o.matched
                      ? <span className="badge green">&rarr; {o.matchedTo?.sku} ({o.matchedTo?.inventory} in stock)</span>
                      : <span className="badge red">Unmatched</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <div className="conn-sub">{list.total} offers - page {list.page} of {list.pages}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => go(page - 1)}>Prev</button>
              <button className="btn btn-ghost" disabled={page >= list.pages} onClick={() => go(page + 1)}>Next</button>
            </div>
          </div>
        </>
      ) : <div className="empty">No offers in this view. Pull offers from the channel first.</div>}

      {showBulk && <BulkMap id={id} onClose={() => setShowBulk(false)}
        onDone={(m) => { setShowBulk(false); setMsg(m); loadSummary(); loadList(1, filter); }} />}
    </div>
  );
}

function BulkMap({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (m: string) => void }) {
  const [field, setField] = useState<"upc" | "sku">("upc");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setErr(""); setBusy(true);
    const ids = text.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (!ids.length) { setErr("Paste at least one value"); setBusy(false); return; }
    try {
      const r = await api.bulkMap(id, field, ids);
      let m = `Mapped ${r.mapped} offer(s)`;
      if (r.notFound?.length) m += ` - ${r.notFound.length} not found`;
      onDone(m);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Bulk map by list</h3>
        <div className="sub">Paste many UPCs or SKUs at once. Each offer matching a catalog item with the same value gets mapped.</div>
        <div className="seg">
          <button className={field === "upc" ? "active" : ""} onClick={() => setField("upc")}>By UPC</button>
          <button className={field === "sku" ? "active" : ""} onClick={() => setField("sku")}>By SKU</button>
        </div>
        <div className="field">
          <label>{field === "upc" ? "UPCs" : "SKUs"} (comma, space, or newline separated)</label>
          <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={field === "upc" ? "810205995311 810205995328" : "BAL-BLK-35 BAL-BLK-36"} />
        </div>
        {err && <div className="toast bad">{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={run} disabled={busy}>{busy ? "Mapping..." : "Map all"}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 18px", minWidth: 120 }}>
      <div className="conn-sub">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: good ? "var(--green)" : bad ? "var(--red)" : "var(--ink)" }}>{value}</div>
    </div>
  );
}

function ManualBulkPanel({ id, setMsg, reload }: { id: string; setMsg: (m: string) => void; reload: () => void }) {
  const [field, setField] = useState<"upc" | "sku">("upc");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    const ids = text.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (!ids.length) { setMsg("Paste at least one value"); return; }
    setBusy(true); setResult(null);
    try {
      const r = await api.bulkMap(id, field, ids);
      setResult(r);
      setMsg(`Mapped ${r.mapped} of ${r.submitted}`);
      reload();
    } catch (e: any) { setMsg("Bulk map failed: " + e.message); } finally { setBusy(false); }
  }

  async function makeSamples() { await api.sampleOffers(id); reload(); setMsg("Sample offers added"); }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Manual mapping</div>
          <div className="conn-sub">Paste all your UPCs or SKUs at once. We map every offer on this channel that matches a catalog item with the same value.</div>
        </div>
        <button className="btn btn-ghost" onClick={makeSamples}>Add sample offers</button>
      </div>

      <div className="seg" style={{ maxWidth: 300 }}>
        <button className={field === "upc" ? "active" : ""} onClick={() => setField("upc")}>By UPC</button>
        <button className={field === "sku" ? "active" : ""} onClick={() => setField("sku")}>By SKU</button>
      </div>

      <div className="field">
        <label>{field === "upc" ? "Paste UPCs" : "Paste SKUs"} (comma, space, or newline separated)</label>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={field === "upc" ? "810205999401\n810221396901\n810221395058" : "CLAR-BLA-W35\nERGO-STO-W39"} />
      </div>

      <button className="btn" onClick={run} disabled={busy}>{busy ? "Mapping..." : "Map all"}</button>

      {result && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat label="Submitted" value={result.submitted} />
            <Stat label="Mapped" value={result.mapped} good />
            <Stat label="Not in catalog" value={result.noCatalog} bad={result.noCatalog > 0} />
            <Stat label="Not on channel" value={result.notOnChannel} bad={result.notOnChannel > 0} />
          </div>
          {result.noCatalog > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="conn-sub" style={{ marginBottom: 4 }}>On channel but not in your catalog ({result.noCatalog}, first {result.noCatalogSample.length} shown):</div>
              <div className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>{result.noCatalogSample.join(", ")}</div>
            </div>
          )}
          {result.notOnChannel > 0 && (
            <div>
              <div className="conn-sub" style={{ marginBottom: 4 }}>Not found as an offer on this channel ({result.notOnChannel}, first {result.notOnChannelSample.length} shown):</div>
              <div className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>{result.notOnChannelSample.join(", ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SyncPanel({ id, syncEnabled, setMsg }: { id: string; syncEnabled: boolean; setMsg: (m: string) => void }) {
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    setBusy(true); setMsg("");
    try {
      const r = await api.syncPreview(id);
      setPreview(r);
      setMsg(`Preview: ${r.total} offers computed (nothing sent)`);
    } catch (e: any) { setMsg("Preview failed: " + e.message); } finally { setBusy(false); }
  }

  async function doRun() {
    if (!syncEnabled) { setMsg("Turn Inventory sync ON first"); return; }
    if (!confirm("Push these quantities to the marketplace now?")) return;
    setBusy(true); setMsg("");
    try {
      const r = await api.syncRun(id);
      if (r.error) setMsg("Sync error: " + r.error);
      else setMsg(`Sync sent ${r.pushed} offers (import ${r.importId || "n/a"})`);
      setPreview(null);
    } catch (e: any) { setMsg("Sync failed: " + e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Inventory push</div>
          <div className="conn-sub">Preview computes quantity = stock - buffer (floored at 0) for every mapped offer. Sync now sends it to the marketplace.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={doPreview} disabled={busy}>{busy ? "Working..." : "Preview"}</button>
          <button className="btn" onClick={doRun} disabled={busy || !syncEnabled} title={!syncEnabled ? "Turn sync ON first" : ""}>Sync now</button>
        </div>
      </div>

      {preview && (
        <>
          <div className="conn-sub" style={{ marginBottom: 8 }}>Showing first {Math.min(preview.rows.length, 100)} of {preview.total}. Nothing has been sent.</div>
          <table className="otable">
            <thead><tr><th>Offer SKU</th><th>Catalog SKU</th><th>Stock</th><th>Buffer</th><th>Qty to send</th><th>Note</th></tr></thead>
            <tbody>
              {preview.rows.slice(0, 100).map((r: any, i: number) => (
                <tr key={i}>
                  <td className="mono">{r.offerSku}</td>
                  <td className="mono">{r.catalogSku ?? "-"}</td>
                  <td>{r.stock}</td>
                  <td>{r.buffer}</td>
                  <td><strong>{r.qty}</strong></td>
                  <td>{r.skipped ? <span className="badge amber">{r.reason}</span> : <span className="badge green">ready</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
