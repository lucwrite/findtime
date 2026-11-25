import CreatePoll, { type Template } from "@/app/CreatePoll";
import CreatorLogin from "@/app/CreatorLogin";
import { isCreator } from "@/lib/auth";
import { readPoll } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ from?: string }> };

export default async function Home({ searchParams }: Props) {
  if (!(await isCreator())) return <CreatorLogin />;
  // "Duplicate" opens /?from=<id>: start the form from that poll's details.
  const { from } = await searchParams;
  const src = typeof from === "string" ? await readPoll(from) : null;
  const template: Template | undefined = src
    ? {
        title: src.title,
        organizer: src.organizer ?? "",
        location: src.location ?? "",
        description: src.description ?? "",
        slotMin: src.slotMin,
        durationMin: src.durationMin,
        slots: src.slots,
      }
    : undefined;
  return <CreatePoll template={template} />;
}
