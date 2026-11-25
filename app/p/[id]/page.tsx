import type { Metadata } from "next";
import { readPoll } from "@/lib/store";
import PollApp from "@/app/p/[id]/PollApp";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poll = await readPoll(id).catch(() => null);
  if (!poll) return { title: "Findtime" };
  return {
    title: `${poll.title} · Findtime`,
    description: poll.organizer
      ? `${poll.organizer} wants to find a time. Add your availability.`
      : "Add your availability to find a time that works.",
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <PollApp id={id} />;
}
