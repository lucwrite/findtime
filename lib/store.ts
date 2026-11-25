import { del, get, list, put } from "@vercel/blob";
import type { StoredPoll, StoredResponse } from "@/lib/types";

// Each poll is one private blob; each response is its own blob, so two people
// answering at the same moment never overwrite each other. Without a Blob token
// (local dev) everything lives in memory.
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
// Shared across route handlers and pages, which Next bundles separately.
const g = globalThis as unknown as { __findtimeMem?: Map<string, string> };
const mem = (g.__findtimeMem ??= new Map<string, string>());

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

// Poll ids are always 10 chars from shortId(); anything else is rejected
// before it gets near a storage path.
export const validId = (id: string) => /^[a-z0-9]{6,20}$/.test(id);

export const readPoll = (id: string) =>
  validId(id) ? readJSON<StoredPoll>(pollPath(id)) : Promise.resolve(null);
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

// Remove a poll and every response to it.
export async function deletePoll(id: string) {
  if (!validId(id)) return;
  const prefix = `polls/${id}/`;
  if (!useBlob()) {
    for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
    return;
  }
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

export async function listPollIds(): Promise<string[]> {
  if (!useBlob()) {
    return [...new Set([...mem.keys()].map((k) => k.split("/")[1]))];
  }
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "polls/", mode: "folded", cursor, limit: 1000 });
    ids.push(...page.folders.map((f) => f.replace(/^polls\//, "").replace(/\/$/, "")));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

// Every poll with its response count, for the organizer's dashboard.
// One listing of all blobs gives the counts; then each poll.json is read.
export async function listAllPolls(): Promise<{ poll: StoredPoll; responses: number }[]> {
  const paths: string[] = [];
  if (!useBlob()) paths.push(...mem.keys());
  else {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "polls/", cursor, limit: 1000 });
      paths.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  const counts = new Map<string, number>();
  for (const p of paths) {
    const [, id, kind] = p.split("/");
    if (!counts.has(id)) counts.set(id, 0);
    if (kind === "r") counts.set(id, counts.get(id)! + 1);
  }
  const rows = await Promise.all(
    [...counts.keys()].map(async (id) => {
      const poll = await readPoll(id).catch(() => null);
      return poll ? { poll, responses: counts.get(id)! } : null;
    }),
  );
  return rows
    .filter((r): r is { poll: StoredPoll; responses: number } => Boolean(r))
    .sort((a, b) => b.poll.createdAt.localeCompare(a.poll.createdAt));
}
