import { del, get, list, put } from "@vercel/blob";
import type { StoredPoll, StoredResponse } from "@/lib/types";

// Each poll is one private blob; each response is its own blob, so two people
// answering at the same moment never overwrite each other. Without a Blob token
// (local dev) everything lives in memory.
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const mem = new Map<string, string>();

const pollPath = (id: string) => `polls/${id}/poll.json`;
const respPrefix = (id: string) => `polls/${id}/r/`;

async function readJSON<T>(pathname: string): Promise<T | null> {
  if (!useBlob()) {
    const v = mem.get(pathname);
    return v ? (JSON.parse(v) as T) : null;
  }
  const r = await get(pathname, { access: "private", useCache: false }).catch(() => null);
  if (!r || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text()) as T;
}

async function writeJSON(pathname: string, data: unknown) {
  const body = JSON.stringify(data);
  if (!useBlob()) return void mem.set(pathname, body);
  await put(pathname, body, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export const readPoll = (id: string) => readJSON<StoredPoll>(pollPath(id));
export const writePoll = (p: StoredPoll) => writeJSON(pollPath(p.id), p);

export async function readResponses(id: string): Promise<StoredResponse[]> {
  let paths: string[];
  if (!useBlob()) {
    paths = [...mem.keys()].filter((k) => k.startsWith(respPrefix(id)));
  } else {
    paths = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: respPrefix(id), cursor, limit: 1000 });
      paths.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  const all = await Promise.all(paths.map((p) => readJSON<StoredResponse>(p)));
  return all
    .filter((r): r is StoredResponse => Boolean(r))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export const readResponse = (pollId: string, rid: string) =>
  readJSON<StoredResponse>(respPrefix(pollId) + rid + ".json");

export const writeResponse = (pollId: string, r: StoredResponse) =>
  writeJSON(respPrefix(pollId) + r.id + ".json", r);

export async function deleteResponse(pollId: string, rid: string) {
  const path = respPrefix(pollId) + rid + ".json";
  if (!useBlob()) return void mem.delete(path);
  const page = await list({ prefix: path, limit: 1 });
  if (page.blobs[0]) await del(page.blobs[0].url);
}
