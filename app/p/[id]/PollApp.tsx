"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SlotGrid from "@/app/SlotGrid";
import {
  bestOptions,
  fmtDay,
  fmtRange,
  fmtTime,
  googleCalUrl,
  icsFile,
  localZone,
  meetingOptions,
} from "@/lib/time";
import type { Mark, Poll, Response } from "@/lib/types";

type Mine = { responseId: string; editKey: string };
type PaintMode = Mark | "erase";

const mineKey = (id: string) => `findtime:resp:${id}`;
const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {}
  },
};

export default function PollApp({ id }: { id: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [missing, setMissing] = useState(false);
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [mine, setMine] = useState<Mine | null>(null);

  // Draft response
  const [editing, setEditing] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // admin editing someone else
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [avail, setAvail] = useState<Record<string, Mark>>({});
  const [mode, setMode] = useState<PaintMode>("yes");
  const strokeMode = useRef<PaintMode>("yes");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "group">("mine");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (key: string | null) => {
      const res = await fetch(`/api/polls/${id}${key ? `?admin=${encodeURIComponent(key)}` : ""}`, { cache: "no-store" });
      if (res.status === 404) return setMissing(true);
      if (!res.ok) return;
      const data = (await res.json()) as { poll: Poll; responses: Response[]; isAdmin: boolean };
      setPoll(data.poll);
      setResponses(data.responses);
      setIsAdmin(data.isAdmin);
      return data;
    },
    [id],
  );

  // First load: pick up admin key (URL or saved), and this browser's own response.
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("admin");
    const key = fromUrl || ls.get(`findtime:admin:${id}`);
    if (fromUrl) ls.set(`findtime:admin:${id}`, fromUrl);
    setIsNew(url.searchParams.get("new") === "1");
    if (url.searchParams.get("new")) {
      url.searchParams.delete("new");
      window.history.replaceState(null, "", url.toString());
    }
    setAdminKey(key);
    let saved: Mine | null = null;
    try {
      saved = JSON.parse(ls.get(mineKey(id)) || "null");
    } catch {}
    load(key).then((data) => {
      if (!data) return;
      const own = saved && data.responses.find((r) => r.id === saved!.responseId);
      if (own && saved) {
        setMine(saved);
        setName(own.name);
        setComment(own.comment);
        setAvail(own.avail);
        setEditing(false);
        setTab("group");
      } else {
        if (saved) ls.set(mineKey(id), null);
        setName(ls.get("findtime:name") || "");
        if (data.poll.closed) {
          setEditing(false);
          setTab("group");
        }
      }
    });
  }, [id, load]);

  // Keep results fresh while people are answering.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(adminKey);
    }, 20000);
    return () => clearInterval(t);
  }, [adminKey, load]);

  const opts = useMemo(() => (poll ? meetingOptions(poll, responses) : []), [poll, responses]);
  const best = useMemo(() => bestOptions(opts), [opts]);
  const optByStart = useMemo(() => new Map(opts.map((o) => [o.start, o])), [opts]);

  // Per-slot counts for the heatmap.
  const counts = useMemo(() => {
    const m = new Map<string, { yes: string[]; maybe: string[] }>();
    if (!poll) return m;
    for (const s of poll.slots) m.set(s, { yes: [], maybe: [] });
    for (const r of responses) {
      for (const [s, v] of Object.entries(r.avail)) m.get(s)?.[v].push(r.name);
    }
    return m;
  }, [poll, responses]);
  const total = responses.length;

  if (missing)
    return (
      <main className="wrap">
        <Brand />
        <h1>Poll not found</h1>
        <p className="lede">This link may be mistyped, or the poll was removed.</p>
        <a className="primary" href="/">Create a new poll</a>
      </main>
    );
  if (!poll)
    return (
      <main className="wrap">
        <Brand />
        <p className="lede loading">Loading…</p>
      </main>
    );

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${poll.id}` : "";
  const adminUrl = adminKey ? `${pageUrl}?admin=${adminKey}` : "";
  const canAnswer = !poll.closed || isAdmin;

  function paint(iso: string, m: PaintMode) {
    setAvail((a) => {
      const n = { ...a };
      if (m === "erase") delete n[iso];
      else n[iso] = m;
      return n;
    });
  }

  async function save() {
    setMsg(null);
    if (!name.trim()) return setMsg({ kind: "err", text: "Please add your first name." });
    setSaving(true);
    const targetId = editingId ?? mine?.responseId;
    const res = await fetch(`/api/polls/${id}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        comment,
        avail,
        responseId: targetId,
        editKey: editingId ? undefined : mine?.editKey,
        adminKey: adminKey ?? undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMsg({ kind: "err", text: data.error || "Couldn't save. Try again." });
    if (!editingId) {
      const m = { responseId: data.responseId, editKey: data.editKey };
      setMine(m);
      ls.set(mineKey(id), JSON.stringify(m));
      ls.set("findtime:name", name.trim());
    }
    setEditingId(null);
    setEditing(false);
    setTab("group");
    setMsg({ kind: "ok", text: "Saved — thanks! You can come back to this link any time to change it." });
    await load(adminKey);
  }

  async function remove(r: Response) {
    if (!confirm(`Remove ${r.name}'s response?`)) return;
    const own = mine?.responseId === r.id;
    await fetch(`/api/polls/${id}/responses`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId: r.id, editKey: own ? mine?.editKey : undefined, adminKey }),
    });
    if (own) {
      setMine(null);
      ls.set(mineKey(id), null);
      setAvail({});
      setComment("");
      setEditing(true);
    }
    await load(adminKey);
  }

  function editResponse(r: Response) {
    const own = mine?.responseId === r.id;
    setEditingId(own ? null : r.id);
    setName(r.name);
    setComment(r.comment);
    setAvail(r.avail);
    setEditing(true);
    setTab("mine");
    setMsg(null);
    document.getElementById("respond")?.scrollIntoView({ behavior: "smooth" });
  }

  function startFresh() {
    setEditingId(null);
    setMine(null);
    ls.set(mineKey(id), null);
    setName("");
    setComment("");
    setAvail({});
    setEditing(true);
    setTab("mine");
    setMsg(null);
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/polls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, adminKey }),
    });
    if (res.ok) await load(adminKey);
  }

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  function downloadIcs(start: string) {
    const blob = new Blob([icsFile(poll!, start, pageUrl)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${poll!.title.replace(/[^\w\- ]+/g, "").trim() || "meeting"}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const focus = picked ?? hover;
  const focusOpt = focus ? optByStart.get(focus) : undefined;
  const focusCounts = focus ? counts.get(focus) : undefined;
  const everyone = responses.map((r) => r.name);
  const yesCount = Object.values(avail).filter((v) => v === "yes").length;
  const maybeCount = Object.values(avail).filter((v) => v === "maybe").length;

  return (
    <main className="wrap wide">
      <Brand />

      <section className="poll-head">
        <h1>{poll.title}</h1>
        <div className="meta">
          {poll.organizer && <span>Organized by <strong>{poll.organizer}</strong></span>}
          <span>{poll.durationMin < 60 ? `${poll.durationMin} min` : `${poll.durationMin / 60} hr`} meeting</span>
          {poll.location && <span>📍 {poll.location}</span>}
          <span>
            {total} response{total === 1 ? "" : "s"}
          </span>
          {poll.closed && <span className="pill">Closed</span>}
        </div>
        {poll.description && <p className="desc">{poll.description}</p>}
        <p className="hint small">Times shown in your time zone: {localZone()}</p>
      </section>

      {poll.finalSlot && (
        <section className="card final">
          <div>
            <span className="eyebrow">Meeting time chosen</span>
            <h2>{fmtRange(poll.finalSlot, poll.durationMin)}</h2>
            {optByStart.get(poll.finalSlot) && (
              <p className="hint">
                {optByStart.get(poll.finalSlot)!.yes.length + optByStart.get(poll.finalSlot)!.maybe.length} of {total} can make it
              </p>
            )}
          </div>
          <div className="btns">
            <a className="primary" href={googleCalUrl(poll, poll.finalSlot, pageUrl)} target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
            <button type="button" className="secondary" onClick={() => downloadIcs(poll.finalSlot!)}>
              Download .ics (Outlook / Apple)
            </button>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className={`card share ${isNew ? "fresh" : ""}`}>
          {isNew && <p className="eyebrow">🎉 Your poll is ready</p>}
          <div className="share-row">
            <div>
              <strong>Share this link with your group</strong>
              <p className="hint small">Anyone with it can add their name and availability.</p>
            </div>
            <div className="copy">
              <input readOnly value={pageUrl} onFocus={(e) => e.target.select()} aria-label="Participant link" />
              <button type="button" className="primary" onClick={() => copy(pageUrl, "share")}>
                {copied === "share" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="share-row">
            <div>
              <strong>Your organizer link</strong>
              <p className="hint small">Keep this private — it lets you pick the final time and manage responses. Bookmark it.</p>
            </div>
            <div className="copy">
              <input readOnly value={adminUrl} onFocus={(e) => e.target.select()} aria-label="Organizer link" />
              <button type="button" className="secondary" onClick={() => copy(adminUrl, "admin")}>
                {copied === "admin" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="admin-actions">
            <button type="button" className="secondary" onClick={() => patch({ closed: !poll.closed })}>
              {poll.closed ? "Reopen poll" : "Close poll"}
            </button>
            {poll.finalSlot && (
              <button type="button" className="link" onClick={() => patch({ finalSlot: null })}>
                Clear chosen time
              </button>
            )}
          </div>
        </section>
      )}

      {msg?.kind === "ok" && !editing && (
        <p className="saved" role="status">✓ {msg.text}</p>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>
          {editing ? "Your availability" : "Your response"}
        </button>
        <button role="tab" aria-selected={tab === "group"} className={tab === "group" ? "on" : ""} onClick={() => setTab("group")}>
          Group results <span className="badge">{total}</span>
        </button>
      </div>

      <div className="panels">
        {/* ---------- Respond ---------- */}
        <section id="respond" className={`card panel ${tab === "mine" ? "show" : ""}`}>
          {editing && canAnswer ? (
            <>
              <h2>{editingId ? `Editing ${name}'s response` : mine ? "Update your availability" : "Add your availability"}</h2>
              <label className="field">
                <span>First name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya" maxLength={30} autoComplete="given-name" />
              </label>
              <div className="paint-bar">
                <span className="seg-label">Paint:</span>
                <div className="seg" role="radiogroup" aria-label="Paint mode">
                  <button type="button" role="radio" aria-checked={mode === "yes"} className={`m-yes ${mode === "yes" ? "on" : ""}`} onClick={() => setMode("yes")}>
                    <i className="sw yes" /> Available
                  </button>
                  <button type="button" role="radio" aria-checked={mode === "maybe"} className={`m-maybe ${mode === "maybe" ? "on" : ""}`} onClick={() => setMode("maybe")}>
                    <i className="sw maybe" /> If needed
                  </button>
                  <button type="button" role="radio" aria-checked={mode === "erase"} className={mode === "erase" ? "on" : ""} onClick={() => setMode("erase")}>
                    <i className="sw no" /> Erase
                  </button>
                </div>
              </div>
              <p className="hint small">Click or drag across the times you can do. Click a painted cell again to clear it.</p>
              <SlotGrid
                label="Your availability"
                slots={poll.slots}
                slotMin={poll.slotMin}
                cellClass={(iso) => (avail[iso] ? `mine-${avail[iso]}` : "mine-none")}
                onPaintStart={(iso) => {
                  // Pressing on a cell that already has this mark clears instead.
                  const m: PaintMode = mode !== "erase" && avail[iso] === mode ? "erase" : mode;
                  strokeMode.current = m;
                  paint(iso, m);
                }}
                onPaintMove={(iso) => paint(iso, strokeMode.current)}
              />
              <div className="quick">
                <button type="button" className="link" onClick={() => setAvail(Object.fromEntries(poll.slots.map((s) => [s, "yes" as Mark])))}>
                  Mark all available
                </button>
                <button type="button" className="link" onClick={() => setAvail({})}>
                  Clear all
                </button>
                <span className="hint small">
                  {yesCount} available · {maybeCount} if needed
                </span>
              </div>
              <label className="field">
                <span>Comment <em>optional</em></span>
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. I'd prefer mornings" maxLength={1000} />
              </label>
              {msg && <p className={msg.kind === "err" ? "error" : "ok"} role="status">{msg.text}</p>}
              <div className="btns">
                <button type="button" className="primary big" disabled={saving} onClick={save}>
                  {saving ? "Saving…" : mine || editingId ? "Save changes" : "Submit availability"}
                </button>
                {(mine || editingId) && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const r = responses.find((x) => x.id === (editingId ?? mine?.responseId));
                      if (r && !editingId) {
                        setName(r.name);
                        setComment(r.comment);
                        setAvail(r.avail);
                      } else if (editingId) {
                        const own = responses.find((x) => x.id === mine?.responseId);
                        setName(own?.name ?? "");
                        setComment(own?.comment ?? "");
                        setAvail(own?.avail ?? {});
                      }
                      setEditingId(null);
                      setEditing(!mine);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="done">
              {mine ? (
                <>
                  <h2>You&rsquo;re in, {name.split(" ")[0]} ✓</h2>
                  <p className="hint">
                    You marked {yesCount} slot{yesCount === 1 ? "" : "s"} available
                    {maybeCount ? ` and ${maybeCount} if needed` : ""}.
                  </p>
                  {canAnswer && (
                    <div className="btns">
                      <button type="button" className="primary" onClick={() => { setEditing(true); setMsg(null); }}>
                        Edit my availability
                      </button>
                      <button type="button" className="link" onClick={startFresh}>
                        Not {name.split(" ")[0]}? Add another person
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2>This poll is closed</h2>
                  <p className="hint">The organizer isn&rsquo;t taking new responses.</p>
                </>
              )}
            </div>
          )}
        </section>

        {/* ---------- Results ---------- */}
        <section className={`card panel ${tab === "group" ? "show" : ""}`}>
          <h2>Group availability</h2>
          {total === 0 ? (
            <p className="hint">No responses yet. Share the link and results will appear here.</p>
          ) : (
            <>
              <div className="legend">
                <span>0/{total}</span>
                <i className="ramp" />
                <span>{total}/{total} available</span>
              </div>
              <SlotGrid
                label="Group availability"
                slots={poll.slots}
                slotMin={poll.slotMin}
                selected={picked}
                cellClass={(iso) => {
                  const c = counts.get(iso);
                  return c && c.yes.length === total && total > 0 ? "all-in" : "";
                }}
                cellStyle={(iso) => {
                  const c = counts.get(iso);
                  const v = c ? (c.yes.length + c.maybe.length * 0.5) / total : 0;
                  return { "--heat": v.toFixed(3) } as React.CSSProperties;
                }}
                cellTitle={(iso) => {
                  const c = counts.get(iso);
                  return `${c?.yes.length ?? 0} available${c?.maybe.length ? `, ${c.maybe.length} if needed` : ""}`;
                }}
                onHover={setHover}
                onSelect={(iso) => setPicked((p) => (p === iso ? null : iso))}
              />
              <div className="detail" aria-live="polite">
                {focus && focusCounts ? (
                  <>
                    <strong>
                      {fmtDay(new Date(focus))} · {fmtTime(new Date(focus))}
                    </strong>
                    <div className="who">
                      <WhoList cls="yes" label="Available" names={focusCounts.yes} />
                      <WhoList cls="maybe" label="If needed" names={focusCounts.maybe} />
                      <WhoList
                        cls="no"
                        label="Not available"
                        names={everyone.filter((n) => !focusCounts.yes.includes(n) && !focusCounts.maybe.includes(n))}
                      />
                    </div>
                    {isAdmin && focusOpt && (
                      <button type="button" className="primary" onClick={() => patch({ finalSlot: focus })}>
                        Choose {fmtTime(new Date(focus))} as the meeting time
                      </button>
                    )}
                  </>
                ) : (
                  <span className="hint">Hover or tap a time to see who&rsquo;s free.</span>
                )}
              </div>
            </>
          )}

          {best.length > 0 && (
            <div className="best">
              <h3>Best times {poll.durationMin > poll.slotMin && <em>for the full {poll.durationMin} min</em>}</h3>
              <ol>
                {best.map((o, i) => (
                  <li key={o.start} className={poll.finalSlot === o.start ? "chosen" : ""}>
                    <div className="best-main">
                      <span className="rank">{i + 1}</span>
                      <div>
                        <strong>{fmtRange(o.start, poll.durationMin)}</strong>
                        <div className="hint small">
                          {o.yes.length + o.maybe.length}/{total} can make it
                          {o.maybe.length > 0 && ` (${o.maybe.length} if needed)`}
                          {o.no.length > 0 && ` · missing: ${o.no.join(", ")}`}
                        </div>
                      </div>
                    </div>
                    <div className="bar"><i style={{ width: `${((o.yes.length + o.maybe.length) / total) * 100}%` }} /></div>
                    {isAdmin && poll.finalSlot !== o.start && (
                      <button type="button" className="secondary sm" onClick={() => patch({ finalSlot: o.start })}>
                        Choose
                      </button>
                    )}
                    {poll.finalSlot === o.start && <span className="pill">Chosen</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {total > 0 && (
            <div className="people">
              <h3>Who&rsquo;s responded</h3>
              <ul>
                {responses.map((r) => {
                  const own = mine?.responseId === r.id;
                  const y = Object.values(r.avail).filter((v) => v === "yes").length;
                  return (
                    <li key={r.id}>
                      <div>
                        <strong>{r.name}</strong>
                        {own && <span className="pill soft">you</span>}
                        <div className="hint small">
                          {y} slot{y === 1 ? "" : "s"} available
                          {r.comment && <> · &ldquo;{r.comment}&rdquo;</>}
                        </div>
                      </div>
                      {(own || isAdmin) && (
                        <div className="row-actions">
                          <button type="button" className="link" onClick={() => editResponse(r)}>Edit</button>
                          <button type="button" className="link danger" onClick={() => remove(r)}>Remove</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      <footer className="foot">
        <a href="/">Create your own poll</a>
      </footer>
    </main>
  );
}

function Brand() {
  return (
    <header className="brand">
      <a href="/">
        <img src="/icon.svg" alt="" width={32} height={32} />
        <span>Findtime</span>
      </a>
    </header>
  );
}

function WhoList({ cls, label, names }: { cls: string; label: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <div className={`who-col ${cls}`}>
      <span className="who-label">
        <i className={`sw ${cls}`} /> {label} ({names.length})
      </span>
      <span>{names.join(", ")}</span>
    </div>
  );
}
