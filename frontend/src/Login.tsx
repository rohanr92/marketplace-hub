import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, saveAuth } from "./api";

export default function Login() {
  const [email, setEmail] = useState("owner@menina.test");
  const [password, setPassword] = useState("password123");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit() {
    setErr(""); setLoading(true);
    try {
      const r = await api.login(email, password);
      saveAuth(r.token, r.user, r.tenant);
      // If this login came from a Shopify app install, continue the install now.
      const si = new URLSearchParams(window.location.search).get("shopify_install");
      if (si) {
        const API_BASE = import.meta.env.VITE_API_URL as string;
        window.location.href = `${API_BASE}/shopify/install?shop=${encodeURIComponent(si)}&token=${encodeURIComponent(r.token)}`;
        return;
      }
      nav(r.user?.isSuperAdmin ? "/admin" : "/connections");
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Marketplace Hub</h1>
        <p>Sign in to your dashboard</p>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <button className="btn" style={{ width: "100%" }} onClick={submit} disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {err && <div className="err">{err}</div>}
        <p style={{ marginTop: 16, fontSize: 13 }}>
          No account? <Link to={`/signup${window.location.search}`} style={{ color: "#c9a227" }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}
