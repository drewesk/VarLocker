import { ml_kem768 } from "@noble/post-quantum/ml-kem";

let _token = "";
let _sessionKey: CryptoKey | null = null;

export function setToken(t: string): void { _token = t; }

export function getToken(): string { return _token; }

// Perform the ML-KEM-768 handshake and store the derived session key.
export async function handshake(): Promise<void> {
  const res = await fetch("/api/handshake");
  const { publicKey } = await res.json() as { publicKey: string };

  const serverPub = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0));
  const { ciphertext, sharedSecret } = ml_kem768.encapsulate(serverPub);

  const body = await fetch("/api/handshake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: btoa(String.fromCharCode(...ciphertext)) }),
  }).then((r) => r.json()) as { sessionKey: string };

  const rawKey = Uint8Array.from(atob(body.sessionKey), (c) => c.charCodeAt(0));
  _sessionKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Authenticated JSON fetch - all secret values go over the Kyber-derived session key.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "authorization": `Bearer ${_token}`,
    "content-type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error);
  }
  return res.json() as Promise<T>;
}
