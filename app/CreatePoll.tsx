"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SlotGrid from "@/app/SlotGrid";
import { dateKey, localZone, minutesLabel, parseDateKey } from "@/lib/time";

const HOURS = Array.from({ length: 25 }, (_, i) => i * 60);
const HALF_HOURS = Array.from({ length: 49 }, (_, i) => i * 30);
type Range = { start: number; end: number };

const endLabel = (m: number) => (m === 1440 ? "midnight" : minutesLabel(m));

function RangePicker({ value, onChange, onRemove }: { value: Range; onChange: (r: Range) => void; onRemove?: () => void }) {
  return (
    <span className="range">
      <select aria-label="From" value={value.start} onChange={(e) => {
        const start = Number(e.target.value);
        onChange({ start, end: Math.max(value.end, start + 30) });
      }}>
        {HALF_HOURS.slice(0, 48).map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
      </select>
      <span className="dash">–</span>
      <select aria-label="To" value={value.end} onChange={(e) => onChange({ ...value, end: Number(e.target.value) })}>
        {HALF_HOURS.slice(1).map((m) => <option key={m} value={m} disabled={m <= value.start}>{endLabel(m)}</option>)}
      </select>
      {onRemove && (
        <button type="button" className="icon-btn x" aria-label="Remove this time block" onClick={onRemove}>×</button>
      )}
    </span>
  );
}
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CreatePoll() {
  const router = useRouter();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [days, setDays] = useState<string[]>([]);
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(17 * 60);
  const [slotMin, setSlotMin] = useState(30);
  // Days with their own hours; days not listed here use the default hours.
  const [custom, setCustom] = useState<Record<string, Range[]>>({});
  const [durationMin, setDurationMin] = useState(60);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [paint, setPaint] = useState<"remove" | "add">("remove");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dragDay = useMemo(() => ({ on: false, adding: true }), []);

  const allSlots = useMemo(() => {
    const out: string[] = [];
    for (const k of [...days].sort()) {
      const base = parseDateKey(k);
      const mins = new Set<number>();
      for (const r of custom[k] ?? [{ start: startMin, end: endMin }]) {
        // Snap to the grid so a 9:30 start still works with 1-hour steps.
        const first = Math.ceil(r.start / slotMin) * slotMin;
        for (let m = first; m + slotMin <= r.end; m += slotMin) mins.add(m);
      }
      for (const m of [...mins].sort((a, b) => a - b)) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(m / 60), m % 60);
        out.push(d.toISOString());
      }
    }
    return out;
  }, [days, startMin, endMin, slotMin, custom]);
  const sortedDays = useMemo(() => [...days].sort(), [days]);
  const setDayRanges = (k: string, r: Range[] | null) =>
    setCustom((c) => {
      const n = { ...c };
      if (r === null) delete n[k];
      else n[k] = r;
      return n;
    });
  const slots = allSlots.filter((s) => !removed.has(s));

  const durations = [15, 30, 45, 60, 90, 120, 180].filter((d) => d % slotMin === 0 && d >= slotMin);
  const effDuration = durations.includes(durationMin) ? durationMin : durations[0];

  // Calendar cells for the visible month, Monday-first.
  const cal = useMemo(() => {
    const first = new Date(month);
    const lead = (first.getDay() + 6) % 7;
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array(lead).fill(null);
    for (let i = 1; i <= n; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);

  const toggleDay = (k: string, adding: boolean) =>
    setDays((cur) => (adding ? (cur.includes(k) ? cur : [...cur, k]) : cur.filter((x) => x !== k)));

  async function create() {
    setError("");
    if (!title.trim()) return setError("Give your meeting a title.");
    if (slots.length === 0) return setError("Pick at least one day and a time range.");
    if (slots.length > 600) return setError("That's too many time slots — pick fewer days or a shorter range.");
    setBusy(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          organizer,
          location,
          description,
          slotMin,
          durationMin: effDuration,
          slots,
          timezone: localZone(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create the poll.");
      try {
        localStorage.setItem(`findtime:admin:${data.id}`, data.adminKey);
        if (organizer.trim()) localStorage.setItem("findtime:name", organizer.trim());
      } catch {}
      router.push(`/p/${data.id}?admin=${data.adminKey}&new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="brand">
        <img src="/icon.svg" alt="" width={32} height={32} />
        <span>Findtime</span>
      </header>
      <h1>Find a time that works for everyone</h1>
      <p className="lede">
        Pick some days and hours, share the link, and everyone paints in when they&rsquo;re free. No accounts needed.
      </p>

      <section className="card">
        <h2><span className="step">1</span> What&rsquo;s the meeting?</h2>
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project kickoff" maxLength={120} />
        </label>
        <div className="two">
          <label className="field">
            <span>Your name <em>optional</em></span>
            <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Lucas" maxLength={60} />
          </label>
          <label className="field">
            <span>Location or link <em>optional</em></span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom / Room 204" maxLength={120} />
          </label>
        </div>
        <label className="field">
          <span>Notes <em>optional</em></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} placeholder="Agenda, anything people should know…" />
        </label>
      </section>

      <section className="card">
        <h2><span className="step">2</span> Which days?</h2>
        <p className="hint">Click or drag across dates.</p>
        <div className="cal">
          <div className="cal-nav">
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous month"
              disabled={month <= new Date(today.getFullYear(), today.getMonth(), 1)}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
          <div className="cal-grid" onPointerUp={() => (dragDay.on = false)} onPointerLeave={() => (dragDay.on = false)}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-dow">{w}</div>
            ))}
            {cal.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = dateKey(d);
              const past = d < today;
              const on = days.includes(k);
              return (
                <button
                  type="button"
                  key={k}
                  disabled={past}
                  className={`cal-day ${on ? "on" : ""} ${k === dateKey(today) ? "today" : ""}`}
                  aria-pressed={on}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragDay.on = true;
                    dragDay.adding = !on;
                    toggleDay(k, !on);
                  }}
                  onPointerEnter={() => dragDay.on && toggleDay(k, dragDay.adding)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggleDay(k, !on);
                    }
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="cal-foot">
            <span>{days.length} day{days.length === 1 ? "" : "s"} selected</span>
            {days.length > 0 && (
              <button type="button" className="link" onClick={() => setDays([])}>
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h2><span className="step">3</span> Which hours?</h2>
        <div className="three">
          <label className="field">
            <span>Default from</span>
            <select value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
              {HOURS.slice(0, 24).map((m) => (
                <option key={m} value={m}>{minutesLabel(m)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Default to</span>
            <select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
              {HOURS.slice(1).map((m) => (
                <option key={m} value={m} disabled={m <= startMin}>
                  {m === 1440 ? "midnight" : minutesLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Meeting length</span>
            <select value={effDuration} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {durations.map((d) => (
                <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? "s" : ""}`.replace("1.5 hrs", "1½ hrs")}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="seg-row">
          <span className="seg-label">Grid steps</span>
          <div className="seg" role="radiogroup" aria-label="Grid steps">
            {[15, 30, 60].map((m) => (
              <button type="button" key={m} role="radio" aria-checked={slotMin === m} className={slotMin === m ? "on" : ""} onClick={() => setSlotMin(m)}>
                {m === 60 ? "1 hour" : `${m} min`}
              </button>
            ))}
          </div>
        </div>
        <p className="hint small">Times are in your time zone ({localZone()}). Everyone else sees them converted to theirs.</p>

        {sortedDays.length > 0 && (
          <div className="per-day">
            <h3>Hours for each day</h3>
            <p className="hint small">
              Every day uses the default hours unless you change it. Add more than one block for split days (e.g. 9–11 and 2–4).
            </p>
            <ul>
              {sortedDays.map((k) => {
                const own = custom[k];
                const ranges = own ?? [{ start: startMin, end: endMin }];
                return (
                  <li key={k} className={own ? "custom" : ""}>
                    <span className="pd-day">{parseDateKey(k).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span className="pd-ranges">
                      {ranges.map((r, i) => (
                        <RangePicker
                          key={i}
                          value={r}
                          onChange={(nr) => setDayRanges(k, ranges.map((x, j) => (j === i ? nr : x)))}
                          onRemove={ranges.length > 1 ? () => setDayRanges(k, ranges.filter((_, j) => j !== i)) : undefined}
                        />
                      ))}
                    </span>
                    <span className="pd-actions">
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          const last = ranges[ranges.length - 1];
                          const start = Math.min(last.end + 60, 1410);
                          setDayRanges(k, [...ranges, { start, end: Math.min(start + 120, 1440) }]);
                        }}
                      >
                        + Add time
                      </button>
                      {own && (
                        <button type="button" className="link muted" onClick={() => setDayRanges(k, null)}>
                          Use default
                        </button>
                      )}
                      <button type="button" className="link muted" onClick={() => toggleDay(k, false)} aria-label="Remove this day">
                        Remove day
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {allSlots.length > 0 && (
        <section className="card">
          <h2><span className="step">4</span> Fine-tune <em>optional</em></h2>
          <div className="seg-row">
            <p className="hint">Block out times that don&rsquo;t work (lunch, another meeting).</p>
            <div className="seg" role="radiogroup" aria-label="Paint mode">
              <button type="button" role="radio" aria-checked={paint === "remove"} className={paint === "remove" ? "on" : ""} onClick={() => setPaint("remove")}>Remove</button>
              <button type="button" role="radio" aria-checked={paint === "add"} className={paint === "add" ? "on" : ""} onClick={() => setPaint("add")}>Restore</button>
            </div>
          </div>
          <SlotGrid
            label="Times to offer"
            slots={allSlots}
            slotMin={slotMin}
            cellClass={(iso) => (removed.has(iso) ? "off" : "offered")}
            onPaintStart={(iso) => {
              const mode = removed.has(iso) ? "add" : "remove";
              setPaint(mode);
              setRemoved((r) => {
                const n = new Set(r);
                if (mode === "remove") n.add(iso);
                else n.delete(iso);
                return n;
              });
            }}
            onPaintMove={(iso) =>
              setRemoved((r) => {
                const n = new Set(r);
                if (paint === "remove") n.add(iso);
                else n.delete(iso);
                return n;
              })
            }
          />
          <p className="hint small">{slots.length} time slot{slots.length === 1 ? "" : "s"} offered</p>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary big" onClick={create} disabled={busy}>
        {busy ? "Creating…" : "Create poll & get link"}
      </button>
      <footer className="foot">Findtime · a tiny group scheduler</footer>
    </main>
  );
}
