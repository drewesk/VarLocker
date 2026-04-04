import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

let _token = "";
let _sessionKey: CryptoKey | null = null;
let _sessionId = "";

export function setToken(t: string): void {
  _token = t;
}

export function getToken(): string {
  return _token;
}

// Encrypt data with the session key
async function encryptData(data: string): Promise<{ iv: string; ciphertext: string }> {
  if (!_sessionKey) throw new Error("No session key");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, _sessionKey, enc);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

// Decrypt data with the session key
async function decryptData(ivB64: string, ciphertextB64: string): Promise<string> {
  if (!_sessionKey) throw new Error("No session key");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, _sessionKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// Perform the ML-KEM-768 handshake and store the derived session key.
export async function handshake(): Promise<void> {
  const res = await fetch("/api/handshake");
  const { publicKey } = (await res.json()) as { publicKey: string };

  const serverPub = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0));
  const { ciphertext, sharedSecret } = ml_kem768.encapsulate(serverPub);

  const body = (await fetch("/api/handshake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: btoa(String.fromCharCode(...ciphertext)) }),
  }).then((r) => r.json())) as { sessionId: string };

  const baseKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  _sessionKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("varlocker-session"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  _sessionId = body.sessionId;
}

// Authenticated JSON fetch - encrypts request bodies and decrypts responses using the session key.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${_token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (_sessionId) headers["x-session-id"] = _sessionId;

  // Encrypt request body if present
  let body: BodyInit | undefined;
  if (init.body) {
    const jsonStr = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    const encrypted = await encryptData(jsonStr);
    headers["content-type"] = "application/encrypted+json";
    headers["x-iv"] = encrypted.iv;
    body = JSON.stringify({ ciphertext: encrypted.ciphertext });
  } else {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(path, { ...init, headers, body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error);
  }

  // Decrypt response if encrypted
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/encrypted+json")) {
    const data = (await res.json()) as { iv: string; ciphertext: string };
    const decrypted = await decryptData(data.iv, data.ciphertext);
    return JSON.parse(decrypted) as T;
  }

  return res.json() as Promise<T>;
}
