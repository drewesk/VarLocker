import { Hono } from "hono";
import { db } from "../db.ts";
import { requireToken } from "../auth.ts";
import { encryptSecret, decryptSecret } from "../crypto.ts";
import { getSessionKey } from "./handshake.ts";

const app = new Hono();

app.use("/*", requireToken);

// Decrypt request body if encrypted with session key
async function decryptRequestBody(c: any): Promise<any> {
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("application/encrypted+json")) {
    return c.req.json();
  }

  const ivB64 = c.req.header("x-iv");
  const body = (await c.req.json()) as { ciphertext: string };
  if (!ivB64 || !body?.ciphertext) {
    throw new Error("Missing encryption headers or ciphertext");
  }

  const sessionKey = getSessionKey();
  if (!sessionKey) {
    throw new Error("Session key not established. Perform handshake first.");
  }

  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(body.ciphertext), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sessionKey, ciphertext);
  const jsonStr = new TextDecoder().decode(decrypted);
  return JSON.parse(jsonStr);
}

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
  const body = await decryptRequestBody(c);
  const { value } = body as { value: string };
  if (value === undefined) return c.json({ error: "value required" }, 400);
  const { enc, iv } = await encryptSecret(value);
  db.run(
    `INSERT INTO secrets (project_id, key, enc_value, iv)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, key) DO UPDATE
     SET enc_value = excluded.enc_value, iv = excluded.iv, updated_at = datetime('now')`,
    [project.id, c.req.param("key"), enc, iv],
  );

  // Encrypt response if request was encrypted
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/encrypted+json")) {
    const sessionKey = getSessionKey();
    if (sessionKey) {
      const responseStr = JSON.stringify({ ok: true });
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sessionKey,
        new TextEncoder().encode(responseStr),
      );
      return c.json(
        {
          iv: btoa(String.fromCharCode(...iv)),
          ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        },
        { headers: { "content-type": "application/encrypted+json" } },
      );
    }
  }
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
  const lines = await Promise.all(
    rows.map(async (r) => `${r.key}=${await decryptSecret(r.enc_value, r.iv)}`),
  );
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
