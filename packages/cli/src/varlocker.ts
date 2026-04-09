import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

type Session = { sessionId: string; sessionKey: CryptoKey };

const b64 = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64"),
  decode: (text: string) => new Uint8Array(Buffer.from(text, "base64")),
};

async function handshake(server: string): Promise<Session> {
  const { publicKey } = await fetch(`${server}/api/handshake`).then((r) => r.json());
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(b64.decode(publicKey));
  const { sessionId } = await fetch(`${server}/api/handshake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: b64.encode(cipherText) }),
  }).then((r) => r.json());
  const baseKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const sessionKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("varlocker-session") },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  return { sessionId, sessionKey };
}

async function decryptJson(session: Session, iv: string, ciphertext: string): Promise<Record<string, string>> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.decode(iv) }, session.sessionKey, b64.decode(ciphertext));
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
}

export async function fetchVarlockerJson(server: string, project: string, token: string): Promise<Record<string, string>> {
  const session = await handshake(server);
  const res = await fetch(`${server}/api/projects/${project}/json`, {
    headers: { authorization: `Bearer ${token}`, "x-session-id": session.sessionId, accept: "application/encrypted+json" },
  });
  if (!res.ok) throw new Error(`varlocker request failed: ${res.status}`);
  const body = await res.json() as { iv: string; ciphertext: string };
  return decryptJson(session, body.iv, body.ciphertext);
}
