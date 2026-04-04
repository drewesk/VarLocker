import { Hono } from "hono";
import { db } from "../db.ts";
import { requireToken } from "../auth.ts";
import { hashNewToken } from "../auth.ts";

const app = new Hono();

app.use("/*", requireToken);

function tokenProjectId(c: any): number | null {
  return (c.get("tokenProjectId") as number | null) ?? null;
}

function requireAdmin(c: any): Response | void {
  if (tokenProjectId(c) !== null) {
    return c.json({ error: "forbidden" }, 403);
  }
}

function ensureProjectAccess(c: any, projectId: number): Response | void {
  const scoped = tokenProjectId(c);
  if (scoped !== null && scoped !== projectId) {
    return c.json({ error: "forbidden" }, 403);
  }
}

// GET /api/projects
app.get("/", (c) => {
  const scoped = tokenProjectId(c);
  if (scoped === null) {
    const rows = db
      .query("SELECT id, name, slug, created_at FROM projects ORDER BY created_at DESC")
      .all();
    return c.json(rows);
  }
  const row = db
    .query("SELECT id, name, slug, created_at FROM projects WHERE id = ?")
    .get(scoped);
  return c.json(row ? [row] : []);
});

// POST /api/projects
app.post("/", async (c) => {
  const adminErr = requireAdmin(c);
  if (adminErr) return adminErr;
  const { name, slug } = await c.req.json<{ name: string; slug: string }>();
  if (!name || !slug) return c.json({ error: "name and slug required" }, 400);
  if (!/^[a-z0-9-]+$/.test(slug))
    return c.json({ error: "slug must be lowercase alphanumeric with dashes" }, 400);
  try {
    db.run("INSERT INTO projects (name, slug) VALUES (?, ?)", [name, slug]);
    const row = db
      .query("SELECT id, name, slug, created_at FROM projects WHERE slug = ?")
      .get(slug);
    return c.json(row, 201);
  } catch {
    return c.json({ error: "slug already exists" }, 409);
  }
});

// DELETE /api/projects/:slug
app.delete("/:slug", (c) => {
  const { slug } = c.req.param();
  const row = db.query("SELECT id FROM projects WHERE slug = ?").get(slug) as { id: number } | null;
  if (!row) return c.json({ error: "not found" }, 404);
  const authErr = ensureProjectAccess(c, row.id);
  if (authErr) return authErr;
  db.run("DELETE FROM projects WHERE id = ?", [row.id]);
  return c.json({ ok: true });
});

// POST /api/projects/:slug/tokens
app.post("/:slug/tokens", async (c) => {
  const { slug } = c.req.param();
  const project = db.query("SELECT id FROM projects WHERE slug = ?").get(slug) as {
    id: number;
  } | null;
  if (!project) return c.json({ error: "not found" }, 404);
  const authErr = ensureProjectAccess(c, project.id);
  if (authErr) return authErr;
  const { name } = await c.req.json<{ name: string }>();
  if (!name) return c.json({ error: "name required" }, 400);
  const raw = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const hash = await hashNewToken(raw);
  db.run("INSERT INTO api_tokens (name, token_hash, project_id) VALUES (?, ?, ?)", [
    name,
    hash,
    project.id,
  ]);
  return c.json({ token: raw }, 201);
});

export default app;
