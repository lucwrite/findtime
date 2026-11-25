"use client";

import { useEffect, useState } from "react";
import { fmtRange } from "@/lib/time";

export type Row = {
  id: string;
  adminKey: string;
  title: string;
  createdAt: string;
  first: string;
  last: string;
  closed: boolean;
  finalSlot: string | null;
  durationMin: number;
  responses: number;
  expires: string;
};

const day = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });

export default function MyPolls({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [copied, setCopied] = useState<string | null>(null);
  // Dates are shown in your own time zone, so wait for the browser before rendering them.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const status = (r: Row) => (r.finalSlot ? "Time chosen" : r.closed ? "Closed" : "Open");
  const shown = rows.filter((r) => filter === "all" || (filter === "open" ? !r.closed && !r.finalSlot : r.closed || r.finalSlot));

  function copy(r: Row) {
    navigator.clipboard?.writeText(`${origin}/p/${r.id}`).then(() => {
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  async function remove(r: Row) {
    if (!confirm(`Delete "${r.title}" and its ${r.responses} response${r.responses === 1 ? "" : "s"}? This can't be undone.`)) return;
    const res = await fetch(`/api/polls/${r.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey: r.adminKey }),
    });
    if (res.ok) setRows((x) => x.filter((y) => y.id !== r.id));
    else alert("Couldn't delete that poll. Try again.");
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/";
  }

  return (
    <main className="wrap wide">
      <header className="brand">
        <a href="/">
          <img src="/icon.svg" alt="" width={32} height={32} />
          <span>Findtime</span>
        </a>
      </header>
      <div className="list-head">
        <div>
          <h1>My polls</h1>
          <p className="hint">{rows.length} poll{rows.length === 1 ? "" : "s"} · only you can see this page</p>
        </div>
        <a className="primary" href="/">+ New poll</a>
      </div>

      {rows.length > 0 && (
        <div className="seg filter" role="radiogroup" aria-label="Filter polls">
          {(["all", "open", "done"] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "open" ? "Open" : "Closed / scheduled"}
            </button>
          ))}
        </div>
      )}

      {!ready ? (
        <p className="hint">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="card empty-state">
          <h2>No polls yet</h2>
          <p className="hint">Polls you create will show up here.</p>
          <a className="primary" href="/">Create your first poll</a>
        </section>
      ) : shown.length === 0 ? (
        <p className="hint">Nothing here.</p>
      ) : (
        <ul className="poll-list">
          {shown.map((r) => (
            <li key={r.id} className="card">
              <div className="pl-main">
                <a className="pl-title" href={`/p/${r.id}?admin=${r.adminKey}`}>{r.title}</a>
                <div className="meta">
                  <span className={`pill ${status(r) === "Open" ? "" : "soft"}`}>{status(r)}</span>
                  <span>
                    <strong>{r.responses}</strong> response{r.responses === 1 ? "" : "s"}
                  </span>
                  <span>
                    {day(r.first)}
                    {day(r.first) !== day(r.last) && ` – ${day(r.last)}`}
                  </span>
                  <span>Created {day(r.createdAt)}</span>
                </div>
                {r.finalSlot && <p className="pl-final">📅 {fmtRange(r.finalSlot, r.durationMin)}</p>}
                <p className="hint small">Auto-deletes {day(r.expires, true)}</p>
              </div>
              <div className="pl-actions">
                <a className="primary" href={`/p/${r.id}?admin=${r.adminKey}`}>Manage</a>
                <button type="button" className="secondary" onClick={() => copy(r)}>
                  {copied === r.id ? "Copied!" : "Copy share link"}
                </button>
                <button type="button" className="link danger" onClick={() => remove(r)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="foot">
        <button type="button" className="link muted" onClick={signOut}>Sign out on this device</button>
      </footer>
    </main>
  );
}
