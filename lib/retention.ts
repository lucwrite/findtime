import type { Poll } from "@/lib/types";

export const KEEP_DAYS = 60;

// A poll is deleted KEEP_DAYS after its last offered time (or after it was
// created, whichever is later).
export function expiresAt(poll: Pick<Poll, "slots" | "createdAt">): Date {
  const last = Math.max(
    new Date(poll.createdAt).getTime(),
    ...poll.slots.map((s) => new Date(s).getTime()),
  );
  return new Date(last + KEEP_DAYS * 86400000);
}
