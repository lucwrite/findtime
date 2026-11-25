import CreatePoll from "@/app/CreatePoll";
import CreatorLogin from "@/app/CreatorLogin";
import { isCreator } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (await isCreator()) ? <CreatePoll /> : <CreatorLogin />;
}
