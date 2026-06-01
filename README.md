# 🧠 Brainuxt

> An AI-powered hierarchical memory system — ingests developer logs, compresses them into layered summaries, indexes them with vector embeddings, and generates an Obsidian-compatible Markdown wiki.

![Stack: Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js)
![Runtime: Bun](https://img.shields.io/badge/Run-Bun-fbf0df?logo=bun)
![DB: SQLite](https://img.shields.io/badge/DB-SQLite%2BVec%2BFTS5-003B57?logo=sqlite)
![AI: MiMo](https://img.shields.io/badge/AI-MiMo%202.5-purple)

---

## Core Concepts

| Operation | Endpoint / Tool | What it does |
|-----------|-----------------|--------------|
| **Remember** | `POST /api/memories/remember` or `brainuxt remember "..."` | Ingest a raw log entry — auto-tags, buffers, flushes to DB with vector embedding |
| **Seal** | `POST /api/memories/seal` or cron (every 20min) | Compress unsealed L0 logs into an L1 summary node via LLM |
| **Seal L2** | `POST /api/memories/seal-l2` or cron (every 12h) | Consolidate L1 summaries into permanent L2 documentation chapters |
| **Recall** | `POST /api/memories/recall` or `brainuxt recall "..."` | Multi-strategy search: semantic vector (L1/L2) → FTS5 temporal fallback (L0) |
| **Dashboard** | `GET /api/dashboard/stats` or `brainuxt status` | Tier densities, open tasks per project, backlogs |
| **Todos** | `GET/POST /api/todos/toggle` | Toggle task completion from `.md` files or API |
| **Token Juice** | _(pre-processor)_ | Compress noisy payloads (HTML, git-status, build logs) before storage |

## Quick Start

```bash
# Install
bun install

# Set your MiMo API key
echo 'MIMO_API_KEY="sk-..."' > .env

# Run
bun run dev
```

### CLI (bin/brainuxt)

```bash
# Ingest a log
brainuxt remember "TODO: Deploy updated FTS indexes to client clusters"

# Search (multi-strategy: semantic cloud → FTS timeline fallback)
brainuxt recall "STRESS_TEST_SEED" -l 1

# Dashboard — tier densities, open tasks by project
brainuxt status
```

### Cron Tasks

Brainuxt runs **autonomous background synthesis** via Nitro scheduled tasks:
- **Every 20 minutes** — `synthesize-l1`: Collects ≥10 unsealed L0 logs and compresses them into an L1 summary
- **Every 12 hours** — `synthesize-l2`: Consolidates ≥5 unsealed L1 summaries into a master L2 documentation chapter

No manual seal calls needed in production — the system self-organizes.

### Test Scripts

```bash
# Seed 105 diverse log entries at high velocity
bash test-scripts/seed-stream.sh

# Full productivity workflow (remember → recall → dashboard)
bash test-scripts/test-productivity.sh

# Semantic lore retrieval test (VTuber character memory)
bash test-scripts/test-vtuber-brain.sh

# Concurrent stress test with mid-stream chaos seal triggers
bun run test-scripts/stress-test.ts

# Bulk seed 4,500 historical entries with mock vectors
curl -X GET http://localhost:3000/api/_test/seed
```

### Docker

```bash
# Set your MiMo API key in docker-compose.yaml or as env var
MIMO_API_KEY="sk-..." docker compose up -d
```

This starts two containers:
- **brainuxt-backend** — The Nuxt/Bun server on `:3000`
- **obsidian-ui** — Self-hosted Obsidian browser UI on `:8443`, sharing the `wiki_vault` volume

The wiki vault, SQLite database, and Obsidian config persist across restarts via Docker named volumes.

### Reset

```bash
bun run reset  # drops vault.db + clears wiki_vault
```

## Documentation

| Document | Covers |
|----------|--------|
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, directory map, buffer pipeline, cron |
| [API Reference](docs/API.md) | All endpoints with schemas and curl examples |
| [Memory Layer](docs/MEMORY_LAYER.md) | L0→L1→L2 compaction, buffer/flush pipeline, FTS fallback, cron synthesis, todo system |
| [Token Juice](docs/TOKEN_JUICE.md) | Content compression profiles and how to extend |
| [Development](docs/DEVELOPMENT.md) | Local setup, conventions, known issues, CLI, test scripts |

## Tech Stack

- **Runtime:** Bun 1.3+
- **Framework:** Nuxt 4 + Nitro (preset: bun)
- **Database:** SQLite + sqlite-vec (384-dim vector search) + FTS5 (full-text keyword search)
- **Embeddings:** HuggingFace Transformers (all-MiniLM-L6-v2, local ONNX/WASM)
- **AI Provider:** MiMo 2.5 via OpenAI-compatible API
- **UI:** Nuxt UI + Tailwind CSS v4
- **Logging:** evlog with structured sampling and transport
- **Scheduling:** Nitro native cron tasks (L1 every 20min, L2 every 12h)
- **CLI:** Bun binary at `bin/brainuxt.ts` (`brainuxt` command)
- **Concurrency:** p-limit (max 5 parallel AI workers during buffer flushes)

## License

Private
te
