import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

type Item = {
  id: string; sku: string; barcode: string | null; title: string;
  description: string | null; imageUrl: string | null;
  price: number; inventory: number; source: string; tracked: boolean;
};

export default function Catalog() {
  const [rows, setRows] = useState<Item[]>([]);
  const [conns, setConns] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  async function load() {
    setRows(await api.listCatalog());
    setConns(await api.listConnections());
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [rows.length]);

  const shopifyConns = conns.filter((c) => c.type === "shopify");
  const hasShopify = shopifyConns.length > 0;

  async function importAll() {
    setBusy(true); setMsg("");
    try { const r = await api.importCatalog(shopifyConns[0].id); setMsg(`Imported ${r.imported} products`); await load(); }
    catch (e: any) { setMsg("Import failed: " + e.message); } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setMsg("");
    try { const r = await api.refreshCatalog(); setMsg(`Refreshed ${r.refreshed} tracked items from Shopify`); await load(); }
    catch (e: any) { setMsg("Refresh failed: " + e.message); } finally { setBusy(false); }
  }

  async function sample() {
    setBusy(true); setMsg("");
    try { const r = await api.sampleCatalog(); setMsg(`Created ${r.created} sample items`); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function toggleTracked(it: Item) {
    await api.setTracked(it.id, !it.tracked);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this catalog item?")) return;
    await api.deleteCatalog(id); load();
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Shell>
      <div className="page-head">
        <h2>Catalog</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={sample} disabled={busy}>Sample items</button>
          <button className="btn btn-ghost" onClick={() => setShowAdd(true)}>+ Add manually</button>
          <button className="btn btn-ghost" onClick={refresh} disabled={busy || !hasShopify}>Refresh tracked</button>
          <button className="btn btn-ghost" onClick={() => setShowImport(true)} disabled={!hasShopify}>Import by UPC/SKU</button>
          <button className="btn" onClick={importAll} disabled={busy || !hasShopify}>
            {busy ? "Working..." : "Import all from Shopify"}
          </button>
        </div>
      </div>

      {!hasShopify && <div className="toast bad" style={{ marginBottom: 16 }}>Add a Shopify channel first to import.</div>}
      {msg && <div className="toast ok" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 && <div className="empty">No catalog items. Import by UPC/SKU, import all, add manually, or load samples.</div>}
        {rows.length > 0 && (
          <table className="otable">
            <thead><tr><th>Product</th><th>SKU</th><th>UPC</th><th>Price</th><th>Inventory</th><th>Sync</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {pageRows.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div className="thumb">{it.imageUrl ? <img src={it.imageUrl} /> : "IMG"}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.title}</div>
                        {it.description && <div className="conn-sub clamp" style={{ maxWidth: 340 }}>{it.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="mono">{it.sku}</td>
                  <td className="mono">{it.barcode ?? "-"}</td>
                  <td>${it.price.toFixed(2)}</td>
                  <td><strong>{it.inventory}</strong></td>
                  <td>
                    <button className={"toggle " + (it.tracked ? "on" : "")} onClick={() => toggleTracked(it)}>
                      <span className="knob" />
                    </button>
                  </td>
                  <td><span className={"badge " + (it.source === "shopify" ? "blue" : "")}>{it.source}</span></td>
                  <td><button className="btn btn-danger" onClick={() => remove(it.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <div className="conn-sub">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span className="conn-sub">Page {page} of {totalPages}</span>
              <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddItem onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {showImport && <ImportByIds conn={shopifyConns[0]} onClose={() => setShowImport(false)}
        onDone={(m) => { setShowImport(false); setMsg(m); load(); }} />}
    </Shell>
  );
}

function ImportByIds({ conn, onClose, onDone }:
  { conn: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [field, setField] = useState<"barcode" | "sku">("barcode");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setErr(""); setBusy(true);
    const identifiers = text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (identifiers.length === 0) { setErr("Paste at least one value"); setBusy(false); return; }
    try {
      const r = await api.importByIds(conn.id, field, identifiers);
      let m = `Imported ${r.imported} item(s)`;
      if (r.notFound?.length) m += ` — not found: ${r.notFound.join(", ")}`;
      onDone(m);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Import by UPC / SKU</h3>
        <div className="sub">Paste a list. Only these items are imported and marked for inventory sync. They auto-update on Refresh.</div>
        <div className="seg">
          <button className={field === "barcode" ? "active" : ""} onClick={() => setField("barcode")}>By UPC</button>
          <button className={field === "sku" ? "active" : ""} onClick={() => setField("sku")}>By SKU</button>
        </div>
        <div className="field">
          <label>{field === "barcode" ? "UPCs" : "SKUs"} (comma, space, or newline separated)</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
            placeholder={field === "barcode" ? "8439990001\n8439990002" : "VERA-TAN-W36\nNAPO-BLA-W36"} />
        </div>
        {err && <div className="toast bad">{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={run} disabled={busy}>{busy ? "Importing..." : "Import"}</button>
        </div>
      </div>
    </div>
  );
}

function AddItem({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ sku: "", barcode: "", title: "", description: "", imageUrl: "", price: "0", inventory: "0" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr(""); setSaving(true);
    try {
      await api.addCatalog({
        sku: f.sku, barcode: f.barcode || undefined, title: f.title,
        description: f.description || undefined, imageUrl: f.imageUrl || undefined,
        price: parseFloat(f.price) || 0, inventory: parseInt(f.inventory) || 0,
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add catalog item</h3>
        <div className="sub">Manually add a product, like Mirakl Connect.</div>
        <div className="field"><label>Title</label><input value={f.title} onChange={set("title")} /></div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>SKU</label><input value={f.sku} onChange={set("sku")} /></div>
          <div className="field" style={{ flex: 1 }}><label>UPC / Barcode</label><input value={f.barcode} onChange={set("barcode")} /></div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>Price</label><input value={f.price} onChange={set("price")} /></div>
          <div className="field" style={{ flex: 1 }}><label>Inventory</label><input value={f.inventory} onChange={set("inventory")} /></div>
        </div>
        <div className="field"><label>Image URL</label><input value={f.imageUrl} onChange={set("imageUrl")} /></div>
        <div className="field"><label>Description</label><input value={f.description} onChange={set("description")} /></div>
        {err && <div className="toast bad">{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={saving || !f.sku || !f.title}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
