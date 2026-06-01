# Development

## Prerequisites

- **Bun** ≥ 1.3.14 (the project uses `bun@1.3.14` as package manager)
- **Node.js** LTS (used by some tooling)
- **macOS:** [Homebrew SQLite](https://formulae.brew.sh/formula/sqlite) required for `sqlite-vec` extension loading on Darwin

```bash
brew install sqlite
```

## Setup

```bash
# Clone and install
bun install

# Set your MiMo API key
echo 'MIMO_API_KEY="sk-..."' > .env

# Start dev server
bun run dev
```

The server starts at `http://localhost:3000`.

## Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start Nuxt dev server with HMR |
| `bun run build` | Production build + copy sharp into output |
| `bun run preview` | Preview production build locally |
| `bun run generate` | Static site generation |
| `bun run copy` | Copy `node_modules/sharp` into `.output/server/node_modules` |
| `bun run reset` | Delete `vault.db` + clear `wiki_vault/L*` + `wiki_vault/README.md` |

## CLI — `bin/brain.ts`

Registered as `"brain"` in `package.json` bin field. A terminal command engine that talks to the running server.

```bash
brainuxt remember "TODO: Deploy updated FTS indexes to client clusters" --profile build-log
brainuxt recall "STRESS_TEST_SEED" -l 3
brainuxt status
brainuxt help
```

| Command | Alias | Description |
|---------|-------|-------------|
| `remember` | `save`, `log` | Post text to `/api/memories/remember`. Supports `--profile` flag |
| `recall` | `find`, `search` | Query `/api/memories/recall`. Supports `-l <number>` for limit |
| `status` | `dashboard` | Fetch `/api/dashboard/stats` and render tiers + backlogs |
| `help` | `-h` | Print help menu |

The `brainuxt recall` output adapts to the search strategy:
- **Semantic macro:** prints each node's content with tags in compact format
- **FTS temporal fallback:** renders full timeline window streams with color-coded target/context markers and timestamps

## Test Scripts

Located in `test-scripts/`:

| Script | Language | What it tests |
|--------|----------|---------------|
| `seed-stream.sh` | Bash | 105 parallel log ingestions, diverse domains/profiles/types |
| `stress-test.ts` | TypeScript (Bun) | 100 concurrent ingestion payloads with mid-stream chaos seal triggers every 400ms. Tests SQLite locking under load |
| `test-productivity.sh` | Bash | Sequential: seed meeting/todo/progress logs → wait 15s for flush → FTS recall → CLI dashboard |
| `test-vtuber-brain.sh` | Bash | Semantic lore retrieval — queries abstract concepts (character glitches, math attitude) against seeded personality/lore/chat logs |

Run from project root:

```bash
bash test-scripts/seed-stream.sh
bun run test-scripts/stress-test.ts
bash test-scripts/test-productivity.sh
bash test-scripts/test-vtuber-brain.sh
```

### Bulk Seed Endpoint

For generating large historical datasets:

```bash
curl -X GET http://localhost:3000/api/_test/seed
```

Seeds 4,500 L0 memories (90 days × 50/day), ~1,125 todos (25% of entries), and random 384-dim mock vectors. Clears all existing data first.

## Cron Tasks

Brainuxt runs autonomous background synthesis via Nitro's native cron engine:

| Task | Schedule | File |
|------|----------|------|
| `memories:synthesize-l1` | `*/20 * * * *` (every 20 min) | `server/tasks/memories/synthesize-l1.ts` |
| `memories:synthesize-l2` | `0 */12 * * *` (every 12 hours) | `server/tasks/memories/synthesize-l2.ts` |

The tasks use Nitro's `defineTask` API. They are configured in `nuxt.config.ts` under `nitro.tasks` and `nitro.scheduledTasks`. No external cron daemon needed — Nitro handles scheduling internally.

In development, tasks can be triggered manually by calling the seal endpoints directly.

## Package Manager

This project uses **Bun** as its package manager (`packageManager: "bun@1.3.14"`). The lockfile is `bun.lock`. Always use `bun install` and `bun add`.

## Project Conventions

### Nuxt 4 + Nitro Bun Preset

- **nitro.preset** — `"bun"` in `nuxt.config.ts`
- **File-based routing** — files in `server/api/` automatically become API routes
- **Nitro server utils** — files in `server/utils/` are auto-imported in server context
- **Nitro tasks** — files in `server/tasks/` registered via `nuxt.config.ts`
- **Shared auto-imports** — `shared/utils/schema` available in both app and Nitro contexts
- **App entry** — `app/app.vue` is the root component (currently `NuxtWelcome`)

### TypeScript

Configuration is split across Nuxt-generated project references. Do not edit `tsconfig.json` directly.

### Vite

Uses `vite-plus` (`@voidzero-dev/vite-plus-core`) with rolldown for builds and oxlint for linting.

### evlog

Structured logging via evlog middleware. Production: 10% sampling rate for info-level logs, always keeps requests ≥1000ms or status ≥400.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `p-limit` | Concurrency limiter for background AI workers (max 5) |
| `sharp` | Image processing (copied into output on build) |
| `sqlite-vec` | 384-dim vector search extension |
| `@huggingface/transformers` | Local ONNX/WASM embedding model (MiniLM-L6-v2) |
| `@ai-sdk/openai-compatible` | MiMo LLM client (LLM tagging, summarization, chapter generation) |
| `zod` | Request validation (v4) |

## Database

The SQLite database file is `vault.db` in the project root. It is gitignored. Reset:

```bash
bun run reset
# or manually:
rm vault.db && rm -rf wiki_vault/L* && rm -rf wiki_vault/README.md
```

Tables are auto-created on startup by `server/plugins/00.initialize-db.ts`:
- `memories` — core memory nodes (L0/L1/L2)
- `vec_memories` — vector embeddings (sqlite-vec virtual table)
- `memories_fts` — full-text search index (FTS5, triggers on insert/delete)
- `todos` — extracted tasks with toggleable completion

## Docker Deployment

```bash
# Set your API key and start both containers
MIMO_API_KEY="sk-..." docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f brainuxt-backend

# Stop
docker compose down
```

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `brainuxt_backend` | `oven/bun:1.3.14` (multi-stage) | `3000` | Nuxt/Nitro Bun server |
| `obsidian_ui` | `linuxserver/obsidian:1.12.7` | `8443` | Self-hosted Obsidian browser UI (KasmVNC) |

### Build

The `Dockerfile` is a two-stage build:

1. **Build stage** — copies `package.json`/`bun.lock`, runs `bun install --frozen-lockfile`, copies source, runs `bun run build`
2. **Runtime stage** — copies `.output/` and `node_modules/`, runs `bun run .output/server/index.mjs`

### Volumes

| Volume | Purpose | Persistence |
|--------|---------|-------------|
| `obsidian_vault` | Shared between backend and Obsidian UI — the `wiki_vault/` Markdown tree | Survives `down` |
| `backend_db` | SQLite `vault.db` persistence | Survives `down` |
| `obsidian_config` | Obsidian UI preferences, plugins, and KasmVNC config | Survives `down` |

### Environment

Set via `docker-compose.yaml` or CLI:

```yaml
environment:
  - NODE_ENV=production
  - APP_URL=http://localhost:3000
  - MIMO_API_KEY=""   # Set this before starting
```

### Notes

- The `obsidian-ui` container runs with `seccomp=unconfined` for KasmVNC hardware rendering
- Access Obsidian at `https://localhost:8443`
- The shared `obsidian_vault` volume is mounted at `/app/wiki_vault` in the backend and `/config/Obsidian/Vaults/wiki_vault` in Obsidian
- Toggle links in `.md` files use `APP_URL` — in Docker, set this to the backend's accessible URL

## Known Issues

### Darwin SQLite Extension Loading

On macOS, system SQLite blocks `sqlite-vec` extension loading. The fix in `server/utils/db.ts`:

```typescript
if (process.platform === "darwin") {
  Database.setCustomSQLite("/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib");
}
```

This requires Homebrew SQLite at the standard Apple Silicon path.

### nuxt-bun-compile Darwin Target

The `nuxt-bun-compile` module requires a manual patch for `bun-darwin-arm64`. A PR is [open upstream](https://github.com/jprando/nuxt-bun-compile/pull/5).

### Single Binary Build

Production builds to a single binary (`brainuxt`). Extra externals configured in `nuxt.config.ts`:

```typescript
bunCompile: {
  target: "bun-darwin-arm64",
  outfile: "brainuxt",
  extraExternals: ["onnxruntime-node", "@huggingface/transformers"],
}
```

After build, sharp must be copied into the output: `bun run build` (runs `nuxt build && bun run copy`).

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `MIMO_API_KEY` | Yes | — | MiMo API key for all LLM calls |
| `MEMORY_LAYER_DIR` | No | `process.cwd()` | Override project root (for standalone binary deployments) |
| `APP_URL` | No | `http://localhost:3000` | Base URL for Obsidian toggle links in wiki `.md` files |

## Directory Conventions

- `server/api/` — Route handlers (Nuxt file-based routing, filename maps to HTTP method)
- `server/utils/` — Server utilities (auto-imported in Nitro context)
- `server/plugins/` — Nitro plugins (numeric prefix controls execution order)
- `server/tasks/` — Nitro cron tasks (registered in nuxt.config.ts)
- `shared/schema/` — Zod schemas shared across app and server
- `bin/` — CLI tools (`brainuxt` command)
- `test-scripts/` — Integration test scripts (bash + TypeScript)
- `wiki_vault/` — Auto-generated, gitignored. Time-partitioned by `YYYY-MM/` subdirectories
- `.tokenjuice/rules/` — Custom TokenJuice compression profiles
- `.cache/brainuxt/models/` — HuggingFace model cache (ONNX/WASM)
