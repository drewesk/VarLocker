import type { Context, Next } from "hono";
import { db } from "./db.ts";

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(buf).toString("hex");
}

export async function requireToken(c: Context, next: Next): Promise<Response | void> {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return c.json({ error: "missing token" }, 401);

  const hash = await hashToken(token);
  const row = db
    .query("SELECT id, project_id FROM api_tokens WHERE token_hash = ?")
    .get(hash) as { id: number; project_id: number | null } | null;

  if (!row) return c.json({ error: "invalid token" }, 401);

  // stamp last_used
  db.run("UPDATE api_tokens SET last_used = datetime('now') WHERE id = ?", [row.id]);

  c.set("tokenProjectId", row.project_id);
  await next();
}

export async function hashNewToken(raw: string): Promise<string> {
  return hashToken(raw);
}
