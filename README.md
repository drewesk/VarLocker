# VarLocker

A self-hosted secrets manager built for developers who use AI coding tools. Your API
keys and env vars live on your own server, not in project files where an AI assistant
can read them.

## The problem

AI tools like Claude Code, Cursor, and Copilot read your project files. If your
secrets are in a .env file, the AI sees them. VarLocker keeps secrets off disk in
your projects entirely - you pull them at runtime, the AI never touches them.

## Quickstart

```bash
# 1. Clone and start the server
git clone https://github.com/drewesk/VarLocker.git
cd VarLocker
cp .env.example .env   # set MASTER_PASSWORD and ADMIN_TOKEN
bun run build && bun run start
# Or with Docker:
docker compose up -d

# 2. Open the UI and connect
# http://localhost:3000
# Enter the ADMIN_TOKEN you set in .env

# 3. Create a project and add secrets via the web UI

# 4. Pull secrets into any project at runtime
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok>
# Or inject them into a child process:
npx varlocker run --server http://localhost:3000 --project myapp --token <tok> -- bun run dev
```

The `npx varlocker pull` command does a Kyber handshake with the server, decrypts
the response locally, and prints your secrets in `.env` format to stdout. Nothing
touches disk unless you redirect it yourself.

## Features

- Web UI to manage projects and secrets
- ML-KEM-768 (Kyber) session setup for secret reads and writes
- AES-256-GCM encryption for secrets at rest
- API tokens scoped per project
- Export as .env or JSON
- Single binary Docker image, runs anywhere
- npx companion CLI for pulling secrets into any project

## Self-hosting

Requirements: Bun, or Docker and Docker Compose.

For remote deployments, put VarLocker behind HTTPS. The Kyber handshake protects
secret payloads, but TLS is still required to authenticate the server.

For a direct Linux droplet deployment, see `deploy/direct-droplet.md`.
Use `deploy/credentials.template.txt` as a local runbook, not as a secret store.

```bash
# Option 1: Run with Bun locally
cp .env.example .env
# Edit .env and set MASTER_PASSWORD and ADMIN_TOKEN
bun run build && bun run start

# Option 2: Run with Docker
cp .env.example .env
# Set MASTER_PASSWORD and ADMIN_TOKEN, then start the container
docker compose up -d
```

**Environment Variables:**
- `MASTER_PASSWORD` (required): Used to derive the encryption key for secrets at rest. Use something long and random.
- `PORT` (optional, default 3000): The port the server listens on.
- `ADMIN_TOKEN` (recommended): If set, this token is automatically created as a global admin token on startup.
- `DATA_DIR` (optional, default `./data` from the server working directory): Directory where the SQLite database and Kyber keypair are stored.

Data is stored in:
- `DATA_DIR/varlocker.db` - SQLite database with projects, secrets, and tokens
- `DATA_DIR/kyber.keypair` - The ML-KEM-768 keypair for secure handshakes

Back up both files and you have everything.

## CLI Usage

The `npx varlocker` companion CLI lets you pull secrets into any project:

```bash
# Pull secrets as .env format (prints to stdout)
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok>

# Save to .env file
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok> > .env

# Run an app with secrets injected into its environment
npx varlocker run --server http://localhost:3000 --project myapp --token <tok> -- node app.js

# List available projects
npx varlocker list --server http://localhost:3000 --token <tok>
```

## TS / Vite App Flow

Use plain JSON for project admin routes. Secret reads require the Kyber session,
and the built-in UI uses the Kyber session for secret writes.

For a copyable backend helper, see `packages/cli/src/varlocker.ts`.

1. Create a project with `POST /api/projects` using an admin token.
2. Create a project token with `POST /api/projects/:slug/tokens`.
3. Add secrets with `PUT /api/projects/:slug/secrets/:key`.
4. At runtime, do `GET /api/handshake`, then `POST /api/handshake`.
5. Derive the AES-GCM session key from the returned Kyber shared secret.
6. Fetch `GET /api/projects/:slug/json` or `/env` with `Authorization`,
   `x-session-id`, and `Accept: application/encrypted+json`.
7. Decrypt the JSON payload locally and inject it into your app.

For browser-only Vite apps, do not ship a VarLocker token to end users. Fetch
from your backend or use `npx varlocker run` during local development.

```ts
import { fetchVarlockerJson } from "./varlocker";

const secrets = await fetchVarlockerJson(
  process.env.VARLOCKER_SERVER!,
  process.env.VARLOCKER_PROJECT!,
  process.env.VARLOCKER_TOKEN!,
);
```

## License

MIT
