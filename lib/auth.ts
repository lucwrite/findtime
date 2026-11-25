import { cookies } from "next/headers";

// Only the organizer needs the password, and only to create polls. The cookie
// holds a hash of CREATE_PASSWORD, so it can't be forged without knowing it,
// and changing the password signs everyone out.
export const COOKIE = "findtime_creator";

export async function sessionToken(): Promise<string> {
  const bytes = new TextEncoder().encode(`findtime:${process.env.CREATE_PASSWORD ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function isCreator(): Promise<boolean> {
  // No password configured: allow it locally, refuse in production.
  if (!process.env.CREATE_PASSWORD) return process.env.NODE_ENV !== "production";
  const cookie = (await cookies()).get(COOKIE)?.value ?? "";
  return safeEqual(cookie, await sessionToken());
}
