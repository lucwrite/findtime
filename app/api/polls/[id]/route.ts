import { NextRequest, NextResponse } from "next/server";
import { readPoll, readResponses, writePoll } from "@/lib/store";
import { LIMITS, str, type Response } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const stored = await readPoll(id);
  if (!stored) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  const { adminKey, ...poll } = stored;
  const isAdmin = req.nextUrl.searchParams.get("admin") === adminKey;
  const responses: Response[] = (await readResponses(id)).map(({ editKey: _k, ...r }) => r);
  return NextResponse.json({ poll, responses, isAdmin });
}

// Organizer-only edits: close/reopen, pick the final time, rename.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const poll = await readPoll(id);
  if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  if (!b || b.adminKey !== poll.adminKey) {
    return NextResponse.json({ error: "Only the organizer can do that." }, { status: 403 });
  }
  if (typeof b.closed === "boolean") poll.closed = b.closed;
  if (b.finalSlot === null || (typeof b.finalSlot === "string" && poll.slots.includes(b.finalSlot))) {
    poll.finalSlot = b.finalSlot;
    if (b.finalSlot) poll.closed = true;
  }
  if (typeof b.title === "string" && b.title.trim()) poll.title = str(b.title, LIMITS.title);
  if (typeof b.description === "string") poll.description = str(b.description, LIMITS.text);
  if (typeof b.location === "string") poll.location = str(b.location, LIMITS.title);
  await writePoll(poll);
  const { adminKey: _a, ...pub } = poll;
  return NextResponse.json({ poll: pub });
}
