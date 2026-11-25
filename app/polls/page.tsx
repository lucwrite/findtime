import type { Metadata } from "next";
import CreatorLogin from "@/app/CreatorLogin";
import MyPolls from "@/app/polls/MyPolls";
import { isCreator } from "@/lib/auth";
import { expiresAt } from "@/lib/retention";
import { listAllPolls } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My polls · Findtime", robots: { index: false, follow: false } };

export default async function Page() {
  if (!(await isCreator())) return <CreatorLogin />;
  const rows = (await listAllPolls()).map(({ poll, responses }) => ({
    id: poll.id,
    adminKey: poll.adminKey,
    title: poll.title,
    createdAt: poll.createdAt,
    first: poll.slots[0],
    last: poll.slots[poll.slots.length - 1],
    closed: poll.closed,
    finalSlot: poll.finalSlot,
    durationMin: poll.durationMin,
    responses,
    expires: expiresAt(poll).toISOString(),
  }));
  return <MyPolls rows={rows} />;
}
