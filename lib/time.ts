import type { Mark, Poll, Response } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDateKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function minutesLabel(min: number, short = false): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (short && m === 0) return `${h12}${ampm}`;
  return `${h12}:${pad(m)}${short ? "" : " "}${ampm}`;
}

export const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function fmtRange(startISO: string, durationMin: number): string {
  const s = new Date(startISO);
  const e = new Date(s.getTime() + durationMin * 60000);
  const day = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return `${day}, ${fmtTime(s)} – ${fmtTime(e)}`;
}

export const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "your time zone";
  } catch {
    return "your time zone";
  }
};

// Lay the UTC slots out as a days × times grid in the viewer's own time zone.
export type GridLayout = {
  days: string[]; // date keys
  rows: number[]; // minutes since midnight
  cell: Map<string, string>; // `${day}|${min}` -> slot ISO
};

export function layoutSlots(slots: string[]): GridLayout {
  const days = new Set<string>();
  const rows = new Set<number>();
  const cell = new Map<string, string>();
  for (const iso of slots) {
    const d = new Date(iso);
    const k = dateKey(d);
    const m = d.getHours() * 60 + d.getMinutes();
    days.add(k);
    rows.add(m);
    cell.set(`${k}|${m}`, iso);
  }
  return {
    days: [...days].sort(),
    rows: [...rows].sort((a, b) => a - b),
    cell,
  };
}

// For each possible start time, who can make the whole meeting?
export type Option = {
  start: string;
  yes: string[]; // names available for the whole meeting
  maybe: string[]; // available, but needs at least one "if needed"
  no: string[];
  score: number;
};

export function meetingOptions(poll: Poll, responses: Response[]): Option[] {
  const have = new Set(poll.slots);
  const steps = Math.max(1, Math.round(poll.durationMin / poll.slotMin));
  const out: Option[] = [];
  for (const start of poll.slots) {
    const t0 = new Date(start).getTime();
    const window: string[] = [];
    for (let i = 0; i < steps; i++) {
      const iso = new Date(t0 + i * poll.slotMin * 60000).toISOString();
      if (!have.has(iso)) break;
      window.push(iso);
    }
    if (window.length < steps) continue;
    const opt: Option = { start, yes: [], maybe: [], no: [], score: 0 };
    for (const r of responses) {
      const marks = window.map((s) => r.avail[s] as Mark | undefined);
      if (marks.every((m) => m === "yes")) opt.yes.push(r.name);
      else if (marks.every((m) => m === "yes" || m === "maybe")) opt.maybe.push(r.name);
      else opt.no.push(r.name);
    }
    opt.score = opt.yes.length + opt.maybe.length * 0.5;
    out.push(opt);
  }
  return out;
}

export function bestOptions(opts: Option[], n = 5): Option[] {
  return [...opts]
    .filter((o) => o.score > 0)
    .sort((a, b) => b.yes.length + b.maybe.length - (a.yes.length + a.maybe.length) || b.yes.length - a.yes.length || a.start.localeCompare(b.start))
    .slice(0, n);
}

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function icsFile(poll: Poll, startISO: string, url: string): string {
  const s = new Date(startISO);
  const e = new Date(s.getTime() + poll.durationMin * 60000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Findtime//EN",
    "BEGIN:VEVENT",
    `UID:${poll.id}-${icsDate(s)}@findtime`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(s)}`,
    `DTEND:${icsDate(e)}`,
    `SUMMARY:${icsEscape(poll.title)}`,
    poll.location ? `LOCATION:${icsEscape(poll.location)}` : "",
    `DESCRIPTION:${icsEscape([poll.description, url].filter(Boolean).join("\n\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function googleCalUrl(poll: Poll, startISO: string, url: string): string {
  const s = new Date(startISO);
  const e = new Date(s.getTime() + poll.durationMin * 60000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: poll.title,
    dates: `${icsDate(s)}/${icsDate(e)}`,
    details: [poll.description, url].filter(Boolean).join("\n\n"),
    location: poll.location,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
