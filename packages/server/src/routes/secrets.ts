import { Hono } from "hono";
import { db } from "../db.ts";
import { requireToken } from "../auth.ts";
import { encryptSecret, decryptSecret } from "../crypto.ts";

const app = new Hono();

app.use("/*", requireToken);

function getProject(slug: string): { id: number } | null {
  return db.query("SELECT id FROM projects WHERE slug = ?").get(slug) as { id: number } | null;
}

// GET /api/projects/:slug/secrets  - keys only, never values
app.get("/:slug/secrets", (c) => {
  const project = getProject(c.req.param("slug"));
  if (!project) return c.json({ error: "not found" }, 404);
  const rows = db
    .query("SELECT key, created_at, updated_at FROM secrets WHERE project_id = ? ORDER BY key")
    .all(project.id);
  return c.json(rows);
});

// PUT /api/projects/:slug/secrets/:key  - upsert
app.put("/:slug/secrets/:key", async (c) => {
  const project = getProject(c.req.param("slug"));
  if (!project) return c.json({ error: "not found" }, 404);
  const { value } = await c.req.json<{ value: string }>();
  if (value === undefined) return c.json({ error: "value required" }, 400);
  const { enc, iv } = await encryptSecret(value);
  db.run(
    `INSERT INTO secrets (project_id, key, enc_value, iv)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, key) DO UPDATE
     SET enc_value = excluded.enc_value, iv = excluded.iv, updated_at = datetime('now')`,
    [project.id, c.req.param("key"), enc, iv]
  );
  return c.json({ ok: true });
});

// DELETE /api/projects/:slug/secrets/:key
app.delete("/:slug/secrets/:key", (c) => {
  const project = getProject(c.req.param("slug"));
  if (!project) return c.json({ error: "not found" }, 404);
  db.run("DELETE FROM secrets WHERE project_id = ? AND key = ?", [project.id, c.req.param("key")]);
  return c.json({ ok: true });
});

// GET /api/projects/:slug/env  - decrypted .env export
app.get("/:slug/env", async (c) => {
  const project = getProject(c.req.param("slug"));
  if (!project) return c.json({ error: "not found" }, 404);
  const rows = db
    .query("SELECT key, enc_value, iv FROM secrets WHERE project_id = ?")
    .all(project.id) as { key: string; enc_value: string; iv: string }[];
  const lines = await Promise.all(rows.map(async (r) => `${r.key}=${await decryptSecret(r.enc_value, r.iv)}`));
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain" } });
});

// GET /api/projects/:slug/json  - decrypted JSON export
app.get("/:slug/json", async (c) => {
  const project = getProject(c.req.param("slug"));
  if (!project) return c.json({ error: "not found" }, 404);
  const rows = db
    .query("SELECT key, enc_value, iv FROM secrets WHERE project_id = ?")
    .all(project.id) as { key: string; enc_value: string; iv: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = await decryptSecret(r.enc_value, r.iv);
  return c.json(out);
});

export default app;
