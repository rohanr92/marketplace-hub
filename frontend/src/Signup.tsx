import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, saveAuth } from "./api";

export default function Signup() {
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit() {
    setErr("");
    if (!company.trim() || !email.trim() || password.length < 8) {
      setErr("Fill all fields. Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const r = await api.signup(email.trim(), password, company.trim());
      saveAuth(r.token, r.user, r.tenant);
      // If this signup came from a Shopify app install, continue the install now.
      const si = new URLSearchParams(window.location.search).get("shopify_install");
      if (si) {
        const API_BASE = import.meta.env.VITE_API_URL as string;
        window.location.href = `${API_BASE}/shopify/install?shop=${encodeURIComponent(si)}&token=${encodeURIComponent(r.token)}`;
        return;
      }
      nav("/connections");
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Marketplace Hub</h1>
        <p>Create your account</p>
        <div className="field">
          <label>Company name</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Solomon &amp; Sage" />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="At least 8 characters" />
        </div>
        <button className="btn" style={{ width: "100%" }} onClick={submit} disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
        {err && <div className="err">{err}</div>}
        <p style={{ marginTop: 16, fontSize: 13 }}>
          Already have an account? <Link to={`/login${window.location.search}`} style={{ color: "#c9a227" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
