import { NextRequest, NextResponse } from "next/server";
import { deleteResponse, readPoll, readResponse, readResponses, writeResponse } from "@/lib/store";
import { LIMITS, str, token, type Mark, type StoredResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Add or update a response. Updating needs the edit key the browser got when it
// first answered (or the organizer's admin key).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const poll = await readPoll(id);
  if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });

  const name = str(b?.name, LIMITS.name);
  if (!name) return NextResponse.json({ error: "Please add your name." }, { status: 400 });

  const valid = new Set(poll.slots);
  const avail: Record<string, Mark> = {};
  if (b?.avail && typeof b.avail === "object") {
    for (const [slot, m] of Object.entries(b.avail)) {
      if (valid.has(slot) && (m === "yes" || m === "maybe")) avail[slot] = m;
    }
  }

  let existing: StoredResponse | null = null;
  if (typeof b?.responseId === "string" && /^[a-z0-9]{1,40}$/.test(b.responseId)) {
    existing = await readResponse(id, b.responseId);
    const allowed = existing && (b.editKey === existing.editKey || b.adminKey === poll.adminKey);
    if (existing && !allowed) {
      return NextResponse.json({ error: "You can only edit your own response." }, { status: 403 });
    }
  }
  const isAdmin = b?.adminKey === poll.adminKey;
  if (poll.closed && !isAdmin) {
    return NextResponse.json({ error: "This poll is closed." }, { status: 403 });
  }
  if (!existing && (await readResponses(id)).length >= LIMITS.maxResponses) {
    return NextResponse.json({ error: "This poll has reached its response limit." }, { status: 400 });
  }

  const resp: StoredResponse = {
    id: existing?.id ?? token(8).replace(/[^a-z0-9]/g, "").slice(0, 12),
    editKey: existing?.editKey ?? token(16),
    name,
    comment: str(b?.comment, LIMITS.text),
    avail,
    updatedAt: new Date().toISOString(),
  };
  await writeResponse(id, resp);
  return NextResponse.json({ responseId: resp.id, editKey: resp.editKey });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const poll = await readPoll(id);
  const rid = typeof b?.responseId === "string" ? b.responseId : "";
  const existing = poll && rid ? await readResponse(id, rid) : null;
  if (!poll || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.editKey !== existing.editKey && b.adminKey !== poll.adminKey) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  await deleteResponse(id, rid);
  return NextResponse.json({ ok: true });
}
