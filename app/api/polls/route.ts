import { NextRequest, NextResponse } from "next/server";
import { writePoll } from "@/lib/store";
import { LIMITS, shortId, str, token, type StoredPoll } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const title = str(b?.title, LIMITS.title);
  const slotMin = Number(b?.slotMin);
  const durationMin = Number(b?.durationMin) || slotMin;
  const slots: string[] = Array.isArray(b?.slots)
    ? [...new Set<string>(b.slots.filter((s: unknown) => typeof s === "string" && !isNaN(Date.parse(s))))]
        .map((s) => new Date(s).toISOString())
        .sort()
    : [];
  if (!title || ![15, 30, 60].includes(slotMin) || slots.length === 0 || slots.length > LIMITS.maxSlots ||
    durationMin % slotMin !== 0 || durationMin < slotMin || durationMin > 480) {
    return NextResponse.json({ error: "Give the poll a title and pick at least one time." }, { status: 400 });
  }
  const poll: StoredPoll = {
    id: shortId(),
    adminKey: token(18),
    title,
    description: str(b?.description, LIMITS.text),
    location: str(b?.location, LIMITS.title),
    organizer: str(b?.organizer, LIMITS.name),
    timezone: str(b?.timezone, 64) || "UTC",
    slotMin,
    durationMin,
    slots,
    createdAt: new Date().toISOString(),
    closed: false,
    finalSlot: null,
  };
  await writePoll(poll);
  return NextResponse.json({ id: poll.id, adminKey: poll.adminKey });
}
