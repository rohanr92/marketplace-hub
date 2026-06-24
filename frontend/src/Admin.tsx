import { useEffect, useState } from "react";
import { api, enterImpersonation, currentUser, logout } from "./api";

const card = { background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: 20 };
const input = { width: "100%", background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "9px 11px", fontSize: 13 };

export default function Admin() {
  const me = currentUser();
  const [tab, setTab] = useState<"companies" | "settings">("companies");
  const [tenants, setTenants] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [nc, setNc] = useState({ companyName: "", ownerEmail: "", ownerPassword: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [newPw, setNewPw] = useState("");

  function load() {
    api.adminTenants().then((d: any) => setTenants(d.tenants ?? [])).catch((e: any) => setMsg(e.message));
    api.adminStats().then(setStats).catch(() => {});
  }
  useEffect(load, []);

  async function enter(tenantId: string, readOnly: boolean) {
    setBusy(tenantId);
    try {
      const r = await api.impersonate(tenantId, readOnly);
      enterImpersonation(r.token, r.tenant, r.readOnly);
      location.href = "/dashboard";
    } catch (e: any) { setMsg(e.message); setBusy(null); }
  }
  async function createCompany() {
    if (!nc.companyName || !nc.ownerEmail || nc.ownerPassword.length < 8) {
      setMsg("Company name, owner email, and 8-char password required"); return;
    }
    try {
      await api.adminCreateCompany(nc.companyName, nc.ownerEmail, nc.ownerPassword);
      setNc({ companyName: "", ownerEmail: "", ownerPassword: "" });
      setShowAdd(false); setMsg("Company created"); load();
    } catch (e: any) { setMsg(e.message); }
  }
  async function changePw() {
    if (newPw.length < 8) { setMsg("New password must be at least 8 characters"); return; }
    try { await api.adminChangePassword(newPw); setNewPw(""); setMsg("Password changed"); }
    catch (e: any) { setMsg(e.message); }
  }
  const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0b0c0f" }}>
      <aside style={{ width: 240, background: "#0e0f13", borderRight: "1px solid #1d1e25", padding: 20, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "#c9a227", color: "#15161b", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>O</span>
          <span style={{ color: "#f2f3f5", fontWeight: 700, fontSize: 17 }}>Operator</span>
        </div>
        <div style={{ color: "#6b6d78", fontSize: 11, marginBottom: 24 }}>Master admin console</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => setTab("companies")} style={navBtn(tab === "companies")}>Companies</button>
          <button onClick={() => setTab("settings")} style={navBtn(tab === "settings")}>Operator settings</button>
        </nav>
        <div style={{ marginTop: "auto" }}>
          <div style={{ color: "#6b6d78", fontSize: 11, marginBottom: 6 }}>{me?.email}</div>
          <button onClick={logout} style={{ background: "none", border: "none", color: "#8b8d98", fontSize: 13, cursor: "pointer", padding: 0 }}>Sign out</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 28, maxWidth: 1100 }}>
        {msg && <div style={{ marginBottom: 14, color: msg.includes("created") || msg.includes("changed") ? "#6ee7a0" : "#ff8080", fontSize: 13 }}>{msg}</div>}

        {tab === "companies" && (
          <>
            <h1 style={{ color: "#f2f3f5", fontSize: 22, marginBottom: 18 }}>Companies</h1>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
              <Stat label="Companies" value={stats?.companies ?? "-"} />
              <Stat label="Total orders" value={stats?.orders ?? "-"} />
              <Stat label="Connections" value={stats?.connections ?? "-"} />
              <Stat label="Total sales" value={stats ? money(stats.totalSales) : "-"} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={() => setShowAdd((v) => !v)} style={{ background: "#c9a227", color: "#15161b", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {showAdd ? "Cancel" : "+ Add company"}
              </button>
            </div>
            {showAdd && (
              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>New company</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "center" }}>
                  <input placeholder="Company name" value={nc.companyName} onChange={(e) => setNc({ ...nc, companyName: e.target.value })} style={input} />
                  <input placeholder="Owner email" value={nc.ownerEmail} onChange={(e) => setNc({ ...nc, ownerEmail: e.target.value })} style={input} />
                  <input type="password" placeholder="Owner password (8+)" value={nc.ownerPassword} onChange={(e) => setNc({ ...nc, ownerPassword: e.target.value })} style={input} />
                  <button onClick={createCompany} style={{ background: "#1c1d24", color: "#c5c6cf", border: "1px solid #303139", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Create</button>
                </div>
              </div>
            )}
            <div style={card}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#6b6d78", fontSize: 12, textAlign: "left" }}>
                    <th style={{ padding: "8px 0" }}>Company</th>
                    <th>Orders</th><th>Channels</th><th>Users</th><th>Created</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} style={{ borderTop: "1px solid #26272f", color: "#d8d9e0", fontSize: 13 }}>
                      <td style={{ padding: "11px 0", display: "flex", alignItems: "center", gap: 8 }}>
                        {t.logoBase64 ? <img src={t.logoBase64} style={{ width: 24, height: 24, borderRadius: 6, objectFit: "contain", background: "#fff" }} /> : <span style={{ width: 24, height: 24, borderRadius: 6, background: "#2a2b33", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#9a9ca6" }}>{t.name.slice(0,1).toUpperCase()}</span>}
                        {t.name}
                      </td>
                      <td>{t.orderCount}</td>
                      <td>{t.connectionCount}</td>
                      <td>{t.userCount}</td>
                      <td style={{ color: "#8b8d98" }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => enter(t.id, true)} disabled={busy === t.id}
                          style={{ background: "#1c1d24", color: "#c5c6cf", border: "1px solid #303139", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer", marginRight: 6 }}>
                          {busy === t.id ? "..." : "Enter read-only"}
                        </button>
                        <button onClick={() => { if (confirm(`Enter ${t.name} with FULL CONTROL? You will act on their behalf.`)) enter(t.id, false); }} disabled={busy === t.id}
                          style={{ background: "#c9a227", color: "#15161b", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Full control
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "settings" && (
          <>
            <h1 style={{ color: "#f2f3f5", fontSize: 22, marginBottom: 18 }}>Operator settings</h1>
            <div style={{ ...card, maxWidth: 420 }}>
              <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Change your password</div>
              <input type="password" placeholder="New password (8+)" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={{ ...input, marginBottom: 12 }} />
              <button onClick={changePw} style={{ background: "#c9a227", color: "#15161b", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Update password</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ color: "#6b6d78", fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color: "#f2f3f5", fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
function navBtn(active: boolean): any {
  return {
    background: active ? "#1c1d24" : "none", border: "none", textAlign: "left",
    color: active ? "#f2f3f5" : "#8b8d98", padding: "9px 12px", borderRadius: 8, fontSize: 14, cursor: "pointer",
  };
}
