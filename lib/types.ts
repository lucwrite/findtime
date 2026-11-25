export type Mark = "yes" | "maybe";

export type Poll = {
  id: string;
  title: string;
  description: string;
  location: string;
  organizer: string;
  timezone: string; // organizer's IANA zone, for display only
  slotMin: number; // length of each slot in minutes
  durationMin: number; // how long the meeting is (a multiple of slotMin)
  slots: string[]; // UTC ISO start times
  createdAt: string;
  closed: boolean;
  finalSlot: string | null;
};

export type StoredPoll = Poll & { adminKey: string };

export type Response = {
  id: string;
  name: string;
  comment: string;
  avail: Record<string, Mark>;
  updatedAt: string;
};

export type StoredResponse = Response & { editKey: string };

export const LIMITS = {
  maxSlots: 600,
  maxResponses: 200,
  name: 60,
  title: 120,
  text: 1000,
};

export function token(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, bytes * 1.5);
}

export function shortId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}

export const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
