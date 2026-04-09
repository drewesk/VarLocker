#!/usr/bin/env bun
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

async function decryptPayload(session: Session, ivB64: string, ciphertextB64: string): Promise<string> {
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, session.sessionKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function fetchEncryptedJson(session: Session, url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-session-id": session.sessionId,
      accept: "application/encrypted+json",
    },
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(error);
  }
  const data = await res.json() as { iv: string; ciphertext: string };
  const decrypted = await decryptPayload(session, data.iv, data.ciphertext);
  return JSON.parse(decrypted);
}

type Session = { sessionId: string; sessionKey: CryptoKey };

async function kyberHandshake(server: string): Promise<Session> {
  const res = await fetch(`${server}/api/handshake`);
  if (!res.ok) throw new Error(`handshake failed: ${res.status}`);
  const { publicKey } = await res.json() as { publicKey: string };

  const serverPub = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0));
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(serverPub);

  const postRes = await fetch(`${server}/api/handshake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: btoa(String.fromCharCode(...cipherText)) }),
  });
  if (!postRes.ok) throw new Error(`handshake failed: ${postRes.status}`);
  const { sessionId } = await postRes.json() as { sessionId: string };

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
    false,
    ["decrypt"],
  );
  return { sessionId, sessionKey };
}

async function pullEnv(server: string, project: string, token: string): Promise<void> {
  const session = await kyberHandshake(server);
  const payload = await fetchEncryptedJson(session, `${server}/api/projects/${project}/env`, token);
  if (!payload?.env) throw new Error("unexpected response");
  process.stdout.write(payload.env);
}

async function runWithEnv(server: string, project: string, token: string, rest: string[]): Promise<void> {
  const session = await kyberHandshake(server);
  const env = await fetchEncryptedJson(session, `${server}/api/projects/${project}/json`, token) as Record<string, string>;

  const proc = Bun.spawn(rest, { env: { ...process.env, ...env }, stdio: ["inherit", "inherit", "inherit"] });
  process.exit(await proc.exited);
}

async function listProjects(server: string, token: string): Promise<void> {
  await kyberHandshake(server);
  const res = await fetch(`${server}/api/projects`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(error);
  }
  const rows = await res.json() as { name: string; slug: string }[];
  for (const row of rows) console.log(`${row.slug}\t${row.name}`);
}

// ---- dispatch ----

if (cmd === "pull") {
  const server = flag("--server") ?? "http://localhost:3000";
  const project = flag("--project");
  const token = flag("--token") ?? process.env.VARLOCKER_TOKEN;
  if (!project || !token) { console.error("usage: varlocker pull --project <slug> --token <tok>"); process.exit(1); }
  pullEnv(server, project, token).catch((e) => { console.error(e.message); process.exit(1); });

} else if (cmd === "run") {
  const server = flag("--server") ?? "http://localhost:3000";
  const project = flag("--project");
  const token = flag("--token") ?? process.env.VARLOCKER_TOKEN;
  const sep = args.indexOf("--");
  const rest = sep !== -1 ? args.slice(sep + 1) : [];
  if (!project || !token || !rest.length) { console.error("usage: varlocker run --project <slug> --token <tok> -- <cmd>"); process.exit(1); }
  runWithEnv(server, project, token, rest).catch((e) => { console.error(e.message); process.exit(1); });

} else if (cmd === "list") {
  const server = flag("--server") ?? "http://localhost:3000";
  const token = flag("--token") ?? process.env.VARLOCKER_TOKEN;
  if (!token) { console.error("usage: varlocker list --token <tok>"); process.exit(1); }
  listProjects(server, token).catch((e) => { console.error(e.message); process.exit(1); });

} else {
  console.log("varlocker <pull|run|list> --server <url> --project <slug> --token <tok> [-- cmd]");
  process.exit(0);
}
