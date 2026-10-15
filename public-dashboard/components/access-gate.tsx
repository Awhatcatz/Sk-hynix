"use client";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import RadarDashboard from "./radar-dashboard";

export default function AccessGate() {
  const [allowed, setAllowed] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const started = useRef(false);
  async function check() {
    setBusy(true); setError("");
    try {
      const token = new URLSearchParams(location.hash.slice(1)).get("access");
      if (token) history.replaceState(null, "", location.pathname + location.search);
      const response = await fetch("/api/access", token ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) } : { cache: "no-store" });
      const data = await response.json() as { allowed?: boolean; error?: string };
      setAllowed(response.ok && data.allowed === true);
      if (data.error) setError(data.error);
    } catch { setError("접근 확인 중 연결이 끊겼습니다. 공유 링크를 다시 열어 주세요."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!started.current) { started.current = true; void check(); } const changed = () => { if (location.hash.includes("access=")) void check(); }; window.addEventListener("hashchange", changed); return () => window.removeEventListener("hashchange", changed); }, []);
  useEffect(() => { if (!allowed) return; const timer = setInterval(async () => { try { const response = await fetch("/api/access", { cache: "no-store" }); const data = await response.json() as { allowed?: boolean }; if (!data.allowed) setAllowed(false); } catch { /* A network outage does not revoke access. */ } }, 60000); return () => clearInterval(timer); }, [allowed]);
  if (allowed) return <RadarDashboard />;
  return <main className="access-screen"><LockKeyhole size={28} /><h1>Hynix Market Radar</h1><p>{busy ? "대시보드 연결 중" : "공유 링크의 연결을 확인해 주세요."}</p>{error && <p role="alert">{error}</p>}<button className="icon-button" disabled={busy} onClick={check} title="연결 다시 확인" aria-label="연결 다시 확인"><RefreshCw size={17} /></button></main>;
}
