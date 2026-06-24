import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api, updateStoredTenant } from "./api";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Bogota", "Europe/Madrid", "Europe/London", "Asia/Dhaka", "UTC",
];

function Field({ label, value, onChange, placeholder, type = "text" }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8b8d98", fontSize: 13, marginBottom: 5 }}>{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "9px 11px", fontSize: 13 }} />
    </div>
  );
}
function Area({ label, value, onChange, placeholder }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8b8d98", fontSize: 13, marginBottom: 5 }}>{label}</label>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", height: 70, resize: "vertical", background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit" }} />
    </div>
  );
}
const card = { background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: 20, marginBottom: 20 };

export default function Settings() {
  const [c, setC] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [nu, setNu] = useState({ email: "", password: "", role: "staff" });
  const [tab, setTab] = useState("company");

  function loadAll() {
    api.getCompany().then(setC).catch((e: any) => setMsg(e.message));
    api.listUsers().then((d: any) => setUsers(d.users ?? [])).catch(() => {});
  }
  useEffect(loadAll, []);

  function set(k: string, v: any) { setC((p: any) => ({ ...p, [k]: v })); }

  function onLogo(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { setMsg("Logo must be under 500KB"); return; }
    const reader = new FileReader();
    reader.onload = () => set("logoBase64", reader.result);
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      await api.updateCompany({
        name: c.name, logoBase64: c.logoBase64, timezone: c.timezone, ein: c.ein,
        sellerName: c.sellerName, sellerEmail: c.sellerEmail, sellerPhone: c.sellerPhone,
        returnAddress: c.returnAddress, shippingAddress: c.shippingAddress,
      });
      updateStoredTenant({ name: c.name, logoBase64: c.logoBase64 });
      setMsg("Saved");
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  async function addUser() {
    if (!nu.email || nu.password.length < 8) { setMsg("User email + 8-char password required"); return; }
    try {
      await api.addUser(nu);
      setNu({ email: "", password: "", role: "staff" });
      loadAll(); setMsg("User added");
    } catch (e: any) { setMsg(e.message); }
  }
  async function removeUser(id: string) {
    if (!confirm("Remove this user?")) return;
    try { await api.removeUser(id); loadAll(); } catch (e: any) { setMsg(e.message); }
  }

  if (!c) return <Shell><div style={{ padding: 24, color: "#8b8d98" }}>Loading...</div></Shell>;

  return (
    <Shell>
      <div style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ color: "#f2f3f5", fontSize: 22, margin: 0 }}>Settings</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {msg ? <span style={{ color: msg === "Saved" || msg === "User added" ? "#6ee7a0" : "#ff8080", fontSize: 13 }}>{msg}</span> : null}
            <button onClick={save} disabled={saving}
              style={{ background: "#c9a227", color: "#15161b", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer" }}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>


        <div data-tabbar style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid #26272f" }}>
          {[["company","Company"],["seller","Seller info"],["addresses","Addresses"],["users","Users"]].map(([k,label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                background: "none", border: "none", borderBottom: tab === k ? "2px solid #c9a227" : "2px solid transparent",
                color: tab === k ? "#f2f3f5" : "#8b8d98", padding: "8px 14px", fontSize: 14, cursor: "pointer", fontWeight: 600,
              }}>{label}</button>
          ))}
        </div>
        {tab === "company" && (<div style={card}>
          <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Company profile</div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 12, background: "#0f1014", border: "1px solid #303139", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {c.logoBase64 ? <img src={c.logoBase64} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "#6b6d78", fontSize: 11 }}>No logo</span>}
            </div>
            <div>
              <input type="file" accept="image/*" onChange={onLogo} style={{ color: "#8b8d98", fontSize: 12 }} />
              <div style={{ color: "#6b6d78", fontSize: 11, marginTop: 4 }}>PNG/JPG, under 500KB</div>
              {c.logoBase64 ? <button onClick={() => set("logoBase64", null)} style={{ marginTop: 6, background: "none", border: "none", color: "#ff8080", fontSize: 12, cursor: "pointer", padding: 0 }}>Remove logo</button> : null}
            </div>
          </div>
          <Field label="Company name" value={c.name} onChange={(v: any) => set("name", v)} />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", color: "#8b8d98", fontSize: 13, marginBottom: 5 }}>Timezone</label>
            <select value={c.timezone ?? "UTC"} onChange={(e) => set("timezone", e.target.value)}
              style={{ width: "100%", background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "9px 11px", fontSize: 13 }}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>)}
        {tab === "seller" && (<div style={card}>
          <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Seller info</div>
          <Field label="EIN / Tax ID" value={c.ein} onChange={(v: any) => set("ein", v)} placeholder="XX-XXXXXXX" />
          <Field label="Seller / legal name" value={c.sellerName} onChange={(v: any) => set("sellerName", v)} />
          <Field label="Seller email" value={c.sellerEmail} onChange={(v: any) => set("sellerEmail", v)} />
          <Field label="Seller phone" value={c.sellerPhone} onChange={(v: any) => set("sellerPhone", v)} />
        </div>)}
        {tab === "addresses" && (<div style={card}>
          <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Addresses</div>
          <Area label="Return address" value={c.returnAddress} onChange={(v: any) => set("returnAddress", v)} placeholder="Street, City, State ZIP, Country" />
          <Area label="Shipping / origin address" value={c.shippingAddress} onChange={(v: any) => set("shippingAddress", v)} placeholder="Street, City, State ZIP, Country" />
        </div>)}
        {tab === "users" && (<div style={card}>
          <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Users</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ color: "#6b6d78", fontSize: 12, textAlign: "left" }}>
                <th style={{ padding: "6px 0" }}>Email</th>
                <th style={{ padding: "6px 0" }}>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #26272f", color: "#d8d9e0", fontSize: 13 }}>
                  <td style={{ padding: "9px 0" }}>{u.email}</td>
                  <td style={{ padding: "9px 0", color: "#8b8d98" }}>{u.role}</td>
                  <td style={{ padding: "9px 0", textAlign: "right" }}>
                    <button onClick={() => removeUser(u.id)} style={{ background: "none", border: "none", color: "#ff8080", fontSize: 12, cursor: "pointer" }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="new.user@email.com" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })}
              style={{ flex: 2, minWidth: 180, background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "8px 10px", fontSize: 13 }} />
            <input type="password" placeholder="password (8+)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })}
              style={{ flex: 1, minWidth: 130, background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "8px 10px", fontSize: 13 }} />
            <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}
              style={{ background: "#0f1014", color: "#e0e1e6", border: "1px solid #303139", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button onClick={addUser} style={{ background: "#1c1d24", color: "#c5c6cf", border: "1px solid #303139", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>Add user</button>
          </div>
        </div>)}
      </div>
    </Shell>
  );
}
