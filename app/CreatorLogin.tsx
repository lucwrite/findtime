"use client";

import { useState } from "react";

export default function CreatorLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) window.location.reload();
    else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="brand">
        <img src="/icon.svg" alt="" width={32} height={32} />
        <span>Findtime</span>
      </header>
      <form className="card login-card" onSubmit={submit}>
        <h1>Create a poll</h1>
        <p className="hint">
          Creating polls is password-protected. If someone sent you a poll link, open that link instead — you don&rsquo;t need a password to answer.
        </p>
        <label className="field">
          <span>Password</span>
          <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">That password didn&rsquo;t match.</p>}
        <button className="primary big" disabled={busy || !password}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
