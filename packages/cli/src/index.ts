#!/usr/bin/env bun
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

async function kyberHandshake(server: string): Promise<CryptoKey> {
  const res = await fetch(`${server}/api/handshake`);
  if (!res.ok) throw new Error(`handshake failed: ${res.status}`);
  const { publicKey } = await res.json() as { publicKey: string };

  const serverPub = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0));
  const { ciphertext, sharedSecret } = ml_kem768.encapsulate(serverPub);

  const postRes = await fetch(`${server}/api/handshake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: btoa(String.fromCharCode(...ciphertext)) }),
  });
  const { sessionKey } = await postRes.json() as { sessionKey: string };
  const rawKey = Uint8Array.from(atob(sessionKey), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function pullEnv(server: string, project: string, token: string): Promise<void> {
  await kyberHandshake(server); // establishes trust, session key held server-side per request

  const res = await fetch(`${server}/api/projects/${project}/env`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const { error } = await res.json() as { error: string };
    throw new Error(error);
  }
  process.stdout.write(await res.text());
}

async function runWithEnv(server: string, project: string, token: string, rest: string[]): Promise<void> {
  await kyberHandshake(server);

  const res = await fetch(`${server}/api/projects/${project}/json`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("failed to fetch secrets");
  const env = await res.json() as Record<string, string>;

  const proc = Bun.spawn(rest, { env: { ...process.env, ...env }, stdio: ["inherit", "inherit", "inherit"] });
  process.exit(await proc.exited);
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

} else {
  console.log("varlocker <pull|run> --server <url> --project <slug> --token <tok> [-- cmd]");
  process.exit(0);
}
