import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDb, db } from "./db.ts";
import { generateKyberKeypair } from "./crypto.ts";
import { hashNewToken } from "./auth.ts";
import handshakeRoute, { loadKyberKeypair } from "./routes/handshake.ts";
import projectsRoute from "./routes/projects.ts";
import secretsRoute from "./routes/secrets.ts";

if (!process.env.MASTER_PASSWORD) {
  console.error("MASTER_PASSWORD is required");
  process.exit(1);
}

initDb();

// Bootstrap: if ADMIN_TOKEN is set, ensure it exists in the DB as a global token.
if (process.env.ADMIN_TOKEN) {
  const hash = await hashNewToken(process.env.ADMIN_TOKEN);
  db.run(
    `INSERT OR IGNORE INTO api_tokens (name, token_hash, project_id) VALUES ('admin', ?, NULL)`,
    [hash]
  );
  console.log("Admin token registered.");
}

// Generate or load the Kyber keypair.
// For production, persist pub/sec to DATA_DIR and reload on restart.
// For MVP, a fresh keypair is generated each start (clients re-handshake).
const keypair = generateKyberKeypair();
loadKyberKeypair(keypair.publicKey, keypair.secretKey);

const app = new Hono();

// API routes
app.route("/api/handshake", handshakeRoute);
app.route("/api/projects", projectsRoute);
app.route("/api/projects", secretsRoute);

// Serve the built UI for everything else
app.use("/*", serveStatic({ root: "./dist/ui" }));
app.get("/*", serveStatic({ path: "./dist/ui/index.html" }));

const PORT = Number(process.env.PORT ?? 3000);
console.log(`VarLocker running on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
