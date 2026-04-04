import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDb, db } from "./db.ts";
import { generateKyberKeypair } from "./crypto.ts";
import { hashNewToken } from "./auth.ts";
import handshakeRoute, { loadKyberKeypair } from "./routes/handshake.ts";
import projectsRoute from "./routes/projects.ts";
import secretsRoute from "./routes/secrets.ts";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";

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
    [hash],
  );
  console.log("Admin token registered.");
}

// Generate or load the Kyber keypair.
// For production, persist pub/sec to DATA_DIR and reload on restart.
// For MVP, a fresh keypair is generated each start (clients re-handshake).
const DATA_DIR = process.env.DATA_DIR ?? "./data";
const KEYPAIR_PATH = join(DATA_DIR, "kyber.keypair");
let keypair;
if (existsSync(KEYPAIR_PATH)) {
  const data = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"));
  keypair = {
    publicKey: new Uint8Array(data.publicKey),
    secretKey: new Uint8Array(data.secretKey),
  };
  console.log("Loaded existing Kyber keypair.");
} else {
  keypair = generateKyberKeypair();
  writeFileSync(
    KEYPAIR_PATH,
    JSON.stringify({
      publicKey: Array.from(keypair.publicKey),
      secretKey: Array.from(keypair.secretKey),
    }),
    "utf8",
  );
  console.log("Generated and saved new Kyber keypair.");
}
loadKyberKeypair(keypair.publicKey, keypair.secretKey);

const app = new Hono();

// API routes
app.route("/api/handshake", handshakeRoute);
app.route("/api/projects", projectsRoute);
app.route("/api/projects", secretsRoute);

const UI_ROOT = existsSync("./dist/ui") ? "./dist/ui" : "./ui/dist/ui";

// Serve the built UI for everything else
app.use("/*", serveStatic({ root: UI_ROOT }));
app.get("/*", (c) => {
  const htmlPath = resolve(join(UI_ROOT, "index.html"));
  const html = readFileSync(htmlPath, "utf-8");
  return c.html(html);
});

const PORT = Number(process.env.PORT ?? 3000);
console.log(`VarLocker running on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
