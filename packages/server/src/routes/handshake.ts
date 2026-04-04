import { Hono } from "hono";
import { kyberDecapsulate } from "../crypto.ts";

const app = new Hono();

// The server keypair is loaded once at startup and held in memory.
// It is never written to the database.
let _serverPublicKey: Uint8Array | null = null;
let _serverSecretKey: Uint8Array | null = null;

export function loadKyberKeypair(pub: Uint8Array, sec: Uint8Array): void {
  _serverPublicKey = pub;
  _serverSecretKey = sec;
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
// and returns it encrypted with itself so the client can confirm the round-trip.
app.post("/", async (c) => {
  if (!_serverSecretKey) return c.json({ error: "keypair not loaded" }, 500);

  const body = await c.req.json<{ ciphertext: string }>();
  if (!body?.ciphertext) return c.json({ error: "missing ciphertext" }, 400);

  const ciphertext = Buffer.from(body.ciphertext, "base64");
  const sharedSecret = kyberDecapsulate(new Uint8Array(ciphertext), _serverSecretKey);

  // Derive a session key from the shared secret using HKDF-SHA256.
  const baseKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const sessionKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("varlocker-session") },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // Export so the client can use it for subsequent encrypted requests.
  const rawKey = await crypto.subtle.exportKey("raw", sessionKey);
  return c.json({ sessionKey: Buffer.from(rawKey).toString("base64") });
});

export default app;
