import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { deletePoll, listPollIds, readPoll } from "@/lib/store";
import { expiresAt } from "@/lib/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Run daily by Vercel Cron (see vercel.json). Vercel sends CRON_SECRET as a bearer token.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const deleted: string[] = [];
  for (const id of await listPollIds()) {
    const poll = await readPoll(id).catch(() => null);
    // A folder with no poll.json is leftover debris; clear it out too.
    if (!poll || expiresAt(poll).getTime() < now) {
      await deletePoll(id);
      deleted.push(id);
    }
  }
  return NextResponse.json({ deleted });
}
