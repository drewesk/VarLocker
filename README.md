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
cp .env.example .env   # set MASTER_PASSWORD
bun run build && bun run start
# Or with Docker:
docker compose up -d

# 2. Open the UI and connect
# http://localhost:3000
# Enter an API token (set ADMIN_TOKEN in .env for a default token, or create one via API)

# 3. Create a project and add secrets via the web UI

# 4. Pull secrets into any project at runtime
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok>
# Or export as .env:
curl -H "Authorization: Bearer <tok>" http://localhost:3000/api/projects/myapp/env > .env
```

The `npx varlocker pull` command does a Kyber handshake with the server, decrypts
the response locally, and prints your secrets in .env format to stdout. Nothing
touches disk unless you redirect it yourself.

## Features

- Web UI to manage projects and secrets
- ML-KEM-768 (Kyber) post-quantum key exchange on every API session
- AES-256-GCM encryption for secrets at rest
- API tokens scoped per project
- Export as .env or JSON
- Single binary Docker image, runs anywhere
- npx companion CLI for pulling secrets into any project

## Self-hosting

Requirements: Docker and Docker Compose (or just Bun).

```bash
# Option 1: Run with Bun locally
cp .env.example .env
# Edit .env and set MASTER_PASSWORD=bomething-long-and-random
bun run build && bun run start

# Option 2: Run with Docker
cp .env.example .env
docker compose up -d
```

**Environment Variables:**
- `MASTER_PASSWORD` (required): Used to derive the encryption key for secrets at rest. Use something long and random.
- `PORT` (optional, default 3000): The port the server listens on.
- `ADMIN_TOKEN` (optional): If set, this token is automatically created as a global admin token on startup.
- `DATA_DIR` (optional, default `./data`): Directory where the SQLite database and Kyber keypair are stored.

Data is stored in:
- `./data/varlocker.db` - SQLite database with projects, secrets, and tokens
- `./data/kyber.keypair` - The ML-KEM-768 keypair for secure handshakes

Back up both files and you have everything.

## CLI Usage

The `npx varlocker` companion CLI lets you pull secrets into any project:

```bash
# Pull secrets as .env format (prints to stdout)
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok>

# Save to .env file
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok> > .env

# List available projects
npx varlocker list --server http://localhost:3000 --token <tok>
```

## License

MIT
