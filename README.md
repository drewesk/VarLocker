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
docker compose up -d

# 2. Open the UI and create a project + API token
# http://localhost:3000

# 3. Pull secrets into any project at runtime
npx varlocker pull --server http://localhost:3000 --project myapp --token <tok>
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

Requirements: Docker and Docker Compose.

```yaml
# docker-compose.yml is included - just set these in .env:
MASTER_PASSWORD=something-long-and-random
PORT=3000
```

Data is stored in a local SQLite file mounted at `./data/varlocker.db`. Back that
file up and you have everything.

## License

MIT
