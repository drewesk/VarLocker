FROM oven/bun:alpine AS builder

WORKDIR /app

COPY package.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/cli/package.json ./packages/cli/

RUN bun install --frozen-lockfile

COPY packages/server ./packages/server

# Build the UI with vite-plus, then compile the server binary
RUN cd packages/server && \
    bunx vite build && \
    bun build src/index.ts --compile --outfile dist/varlocker

# ---- final image ----
FROM alpine:3.19

RUN apk add --no-cache libstdc++ ca-certificates

WORKDIR /app

COPY --from=builder /app/packages/server/dist ./dist

RUN mkdir -p /data

ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["./dist/varlocker"]
