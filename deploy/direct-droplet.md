# Direct Droplet Deploy

1. Create a Debian droplet with `doctl` and SSH access.
2. SSH in as root once, then create a `varlocker` user.
3. Install Bun and Caddy.
4. Clone this repo into `/opt/varlocker`.
5. Create `/var/lib/varlocker` and `chown` it to `varlocker`.
6. Create `/etc/varlocker/varlocker.env` with:
   - `MASTER_PASSWORD=...`
   - `ADMIN_TOKEN=...`
   - `PORT=3000`
   - `DATA_DIR=/var/lib/varlocker`
7. Run `bun install && bun run build` in `/opt/varlocker`.
8. Copy `deploy/varlocker.service` to `/etc/systemd/system/varlocker.service`.
9. Run `systemctl daemon-reload && systemctl enable --now varlocker`.
10. Copy `deploy/Caddyfile.example` into `/etc/caddy/Caddyfile` and set your domain.
11. Run `systemctl reload caddy`.
12. Verify:
   - `curl http://127.0.0.1:3000/health`
   - `curl https://your-domain/api/handshake`
   - open the UI in a browser
