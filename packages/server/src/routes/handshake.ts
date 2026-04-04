import { Hono } from "hono";
import { kyberDecapsulate } from "../crypto.ts";

const app = new Hono();

// The server keypair is loaded once at startup and held in memory.
// It is never written to the database.
let _serverPublicKey: Uint8Array | null = null;
let _serverSecretKey: Uint8Array | null = null;
const _sessions = new Map<string, CryptoKey>();

export function loadKyberKeypair(pub: Uint8Array, sec: Uint8Array): void {
  _serverPublicKey = pub;
  _serverSecretKey = sec;
}

export function getSessionKey(sessionId: string | null): CryptoKey | null {
  if (!sessionId) return null;
  return _sessions.get(sessionId) ?? null;
}

// GET /api/handshake
// Returns the server's ML-KEM-768 public key so the client can encapsulate.
app.get("/", (c) => {
  if (!_serverPublicKey) return c.json({ error: "keypair not loaded" }, 500);
  return c.json({ publicKey: Buffer.from(_serverPublicKey).toString("base64") });
});

// POST /api/handshake
// Client sends { ciphertext } produced by ml_kem768.encapsulate(serverPublicKey).
// Server decapsulates to get the shared secret, derives a session key via HKDF,
// and returns an opaque session id the client includes on subsequent requests.
app.post("/", async (c) => {
  if (!_serverSecretKey) return c.json({ error: "keypair not loaded" }, 500);

  const body = await c.req.json<{ ciphertext: string }>();
  if (!body?.ciphertext) return c.json({ error: "missing ciphertext" }, 400);

  const ciphertext = Buffer.from(body.ciphertext, "base64");
  const sharedSecret = kyberDecapsulate(new Uint8Array(ciphertext), _serverSecretKey);

  // Derive a session key from the shared secret using HKDF-SHA256.
  const baseKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const sessionKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("varlocker-session"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const sessionId = crypto.randomUUID();
  _sessions.set(sessionId, sessionKey);
  return c.json({ sessionId });
});

export default app;
