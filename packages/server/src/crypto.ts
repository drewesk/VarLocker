import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

// ---------- key derivation ----------

async function masterKey(): Promise<CryptoKey> {
  const pw = process.env.MASTER_PASSWORD;
  if (!pw) throw new Error("MASTER_PASSWORD is not set");
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  const salt = enc.encode("varlocker-v1-salt");
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 210_000 },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------- at-rest encryption ----------

export async function encryptSecret(plaintext: string): Promise<{ enc: string; iv: string }> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  return {
    enc: Buffer.from(cipherBuf).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  };
}

export async function decryptSecret(encB64: string, ivB64: string): Promise<string> {
  const key = await masterKey();
  const iv = Buffer.from(ivB64, "base64");
  const cipherBuf = Buffer.from(encB64, "base64");
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

// ---------- Kyber / ML-KEM-768 ----------

export type KyberKeypair = { publicKey: Uint8Array; secretKey: Uint8Array };

export function generateKyberKeypair(): KyberKeypair {
  return ml_kem768.keygen();
}

export function kyberEncapsulate(publicKey: Uint8Array): {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
} {
  return ml_kem768.encapsulate(publicKey);
}

export function kyberDecapsulate(ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ml_kem768.decapsulate(ciphertext, secretKey);
}
