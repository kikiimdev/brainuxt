# Architecture

## Overview

Brainuxt is a **three-tier hierarchical memory system** running on Nuxt 4 with a SQLite backend. It ingests raw developer logs through a RAM buffer, progressively compresses them using AI (cron or manual), indexes everything for dual-strategy search (semantic vector + FTS5 temporal fallback), and auto-generates an Obsidian-compatible Markdown wiki with time-partitioned directories and interactive todo tracking.

## Pipeline

```
                     ┌──────────────────────────────────┐
                     │         Entry Points              │
                     │  REST API  │  brain CLI  │  Cron  │
                     └──────────────┬───────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       POST /remember         POST /seal            POST /recall
       brainuxt remember         brainuxt recall
       (→ RAM buffer)         cron synthesize-*     (→ dual strategy)

                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
  RAM Buffer                   Compaction                   Dual Search
  (queueMemoryToBuffer)        Engine                       ├─ semantic_macro_tree
  max 10 items / 5s flush     ┌────┴────┐                  │  (sqlite-vec L1/L2,
       │                       ▼         ▼                  │   distance ≤1.1)
       │                   synthesize  synthesize           │
       ▼                   -l1        -l2                   └─ relational_fts_granular
  Background Worker        (L0→L1)    (L1→L2)                 _fallback
  (p-limit 5 concurrent)      │         │                     (FTS5 L0, ±2 rowid
  extractLabels + embed       │         │                      temporal windows)
       │                      │         │
       └──────────┬───────────┘─────────┘─────────────────────────┘
                  ▼
           SQLite + sqlite-vec + FTS5
           (memories, vec_memories, memories_fts, todos)
                  │
                  ▼
           Wiki Generator
           Obsidian .md (time-partitioned)
           with inline todo toggle links
```

## Three-Tier Memory Model

```
L2 ─ Documentation Chapters
│    Permanent technical docs compiled from ≥5 L1 summaries.
│    Created by cron (every 12h) or POST /seal-l2.
│
├── L1 ─ Summarized Clusters
│    AI-compressed summaries of ≥10 raw L0 log entries.
│    Created by cron (every 20min) or POST /seal.
│
└── L0 ─ Raw Log Ledger
     Individual developer log entries ingested through
     POST /remember or `brainuxt remember`.
```

## Directory Map

```
brainuxt/
├── app/                          # Frontend (Nuxt)
│   ├── assets/css/main.css       # Tailwind + Nuxt UI imports
│   └── app.vue                   # Root component (NuxtWelcome placeholder)
│
├── bin/
│   └── brainuxt.ts              # CLI tool (brainuxt remember/recall/status)
│
├── server/                       # Backend (Nitro)
│   ├── api/
│   │   ├── _test/
│   │   │   └── seed.get.ts       # GET /api/_test/seed — bulk seed 4,500 rows
│   │   ├── dashboard/
│   │   │   └── stats.get.ts      # GET /api/dashboard/stats — tier densities + todo backlogs
│   │   ├── memories/
│   │   │   ├── remember.post.ts  # POST /api/memories/remember — ingest + parse + buffer
│   │   │   ├── seal.post.ts      # POST /api/memories/seal — L0→L1 manual seal
│   │   │   ├── seal-l2.post.ts   # POST /api/memories/seal-l2 — L1→L2 manual seal
│   │   │   ├── recall.post.ts    # POST /api/memories/recall — dual-strategy search
│   │   │   └── todos/
│   │   │       └── pending.get.ts# GET /api/memories/todos/pending — AI-extracted pending
│   │   └── todos/
│   │       └── toggle.ts         # GET/POST /api/todos/toggle — toggle completion
│   │
│   ├── plugins/
│   │   └── 00.initialize-db.ts   # Nitro plugin — inits DB + tables on startup
│   │
│   ├── tasks/memories/
│   │   ├── synthesize-l1.ts      # Cron: L0→L1 every 20min (≥10 unsealed L0)
│   │   └── synthesize-l2.ts      # Cron: L1→L2 every 12h (≥5 unsealed L1)
│   │
│   └── utils/
│       ├── db.ts                 # SQLite connection, 5 tables, 2 triggers, 2 indexes
│       ├── buffer.ts             # RAM buffer (10 items / 5s), p-limit 5, batch flush
│       ├── ai-config.ts          # AI provider factory (MiMo via OpenAI-compatible)
│       ├── ai-engine.ts          # runCompactionEngine() — L0→L1 (manual seal)
│       ├── ai-l2-engine.ts       # runL2CompactionEngine() — L1→L2 (manual seal)
│       ├── ai-models.ts          # Embeddings + tag classification + LLM tagging
│       ├── ai-token-juice.ts     # TokenJuiceEngine — content compression profiles
│       ├── ai-wiki.ts            # generateWikiFiles() + generateSingleWikiFile() — vault
│       ├── content-tags.ts       # extractLabelsFromContent() — tag orchestration
│       └── utils.ts              # generateId(), getStandardWikiFileName()
│
├── shared/
│   └── schema/
│       └── tag-config.ts         # Zod schema: tagConfig
│
├── test-scripts/
│   ├── seed-stream.sh            # 105 parallel log ingestions
│   ├── stress-test.ts            # Concurrent load test with chaos seal triggers
│   ├── test-productivity.sh      # End-to-end: ingest → recall → dashboard
│   └── test-vtuber-brain.sh      # Semantic lore retrieval test
│
├── wiki_vault/                   # Auto-generated Obsidian vault
│   ├── README.md                 # Central index + Master Task Board + node links
│   ├── L0_Log/YYYY-MM/           # Raw memory markdown (time-partitioned)
│   ├── L1_Summaries/YYYY-MM/     # Summary markdown (time-partitioned)
│   └── L2_Chapters/YYYY-MM/      # Chapter markdown (time-partitioned)
│
├── .tokenjuice/rules/            # Custom compression profiles
├── nuxt.config.ts                # Nuxt + evlog + bunCompile + cron scheduling
├── vite.config.ts                # vite-plus (lint, fmt)
├── package.json                  # Dependencies (p-limit, sharp) and scripts (reset)
├── .env                          # MIMO_API_KEY
└── vault.db                      # SQLite database file
```

## Database Schema

### `memories` — Core memory nodes

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  level INTEGER DEFAULT 0,        -- 0=raw, 1=summary, 2=chapter
  tags TEXT,                       -- Comma-separated
  parent_id TEXT REFERENCES memories(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sealed_at TIMESTAMP,
  l2_sealed_at TIMESTAMP
);
```

### `vec_memories` — Vector embeddings

```sql
CREATE VIRTUAL TABLE vec_memories USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[384]             -- 384-dim cosine distance
);
```

### `memories_fts` — Full-text search

```sql
CREATE VIRTUAL TABLE memories_fts USING fts5(
  id UNINDEXED,
  content,
  tags,
  tokenize = "ascii separators '_'"  -- Preserves underscores in tokens
);
```

Auto-populated via `AFTER INSERT` and `AFTER DELETE` triggers on `memories`.

### `todos` — Extracted tasks

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  memory_id TEXT,                  -- FK to memories.id
  task_text TEXT,
  is_completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(memory_id) REFERENCES memories(id)
);
```

### Indexes

```sql
CREATE INDEX idx_memories_level_sealed ON memories(level, sealed_at);
CREATE INDEX idx_todos_lookup ON todos(is_completed, task_text);
```

## Data Flow by Operation

### Remember (`POST /api/memories/remember`)

```
Content → Parse lines (checkbox, TODO/PROGRESS/DONE prefixes)
    → Separate tasks (todos table) from clean text
    → TokenJuice.compress(profile) on remaining text
    → queueMemoryToBuffer() → return immediately
         │
         ▼ (background)
    Buffer accumulates 10 items or 5 seconds
    → flushBufferToStorage() with p-limit(5)
         │
         ▼ (per item, 5 concurrent)
    extractLabelsFromContent() + generateEmbedding()
    → transaction: INSERT memories + memories_fts + vec_memories + todos
```

### Recall (`POST /api/memories/recall`) — Dual Strategy

```
Step 1: semantic_macro_tree
  Embed query → sqlite-vec MATCH on L1/L2 nodes
  If best distance ≤ 1.1 → return as "semantic_macro_tree"

Step 2: relational_fts_granular_fallback (triggered if distance > 1.1)
  Tokenize query → FTS5 MATCH on memories_fts (L0 only)
  For each hit → temporal window: ±2 rowid neighbors
  Return as "relational_fts_granular_fallback" with context_stream

Step 3: semantic_last_resort_weak (if FTS returns nothing)
  Return the weak semantic results as-is
```

## Cron Tasks

| Task | Schedule | Handler | Threshold | Action |
|------|----------|---------|-----------|--------|
| `memories:synthesize-l1` | Every 20 min (`*/20 * * * *`) | `server/tasks/memories/synthesize-l1.ts` | ≥10 unsealed L0 | Collects up to 50 L0, summarizes via LLM, seals children |
| `memories:synthesize-l2` | Every 12 hours (`0 */12 * * *`) | `server/tasks/memories/synthesize-l2.ts` | ≥5 unsealed L1 | Collects up to 20 L1, compiles into L2 chapter, seals children |

Both tasks call `generateSingleWikiFile()` per-node and `generateCentralIndex()` on completion.

## Wiki Structure

The wiki now uses **time-partitioned directories** to handle large datasets:

```
wiki_vault/
├── README.md                        # Master Task Board + L2/L1/L0 links
├── L0_Log/
│   ├── 2026-05/
│   │   └── 20260531_184726_L0_mem_xxx.md
│   └── 2026-06/
│       └── 20260601_091212_L0_mem_yyy.md
├── L1_Summaries/
│   └── 2026-06/
│       └── 20260601_094500_L1_mem_zzz.md
└── L2_Chapters/
    └── 2026-06/
        └── 20260601_120000_L2_mem_www.md
```

Each `.md` file includes:
- **YAML frontmatter** — `id`, `level`, `tags`, `timeline_partition`, `created_at`, `sealed_at`
- **Active Action Items** — inline todos with clickable toggle links pointing to `/api/todos/toggle?id=...`
- **Tree lineage** — bidirectional Obsidian wiki links with time-partitioned paths

The central `README.md` index now features a **Master Project Task Board** (recent 25 tasks with completion progress bar) instead of the widget, capped link lists per level, and percentage-based efficiency scoring.

## Configuration

### nuxt.config.ts

- **nitro.preset** — `"bun"`
- **nitro.tasks** — Two scheduled synthesis tasks (L1 every 20min, L2 every 12h)
- **evlog** — Structured logging, production sampling (10% info), keep rules
- **bunCompile** — Single binary targeting `bun-darwin-arm64`, extra externals for `onnxruntime-node` and `@huggingface/transformers`

### Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `MIMO_API_KEY` | Yes | MiMo API key for LLM calls |
| `MEMORY_LAYER_DIR` | No | Override project root (defaults to `cwd`) |
| `APP_URL` | No | Base URL for todo toggle links in wiki (defaults to `http://localhost:3000`) |

### Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Start dev server |
| `bun run build` | Production build + copy sharp |
| `bun run reset` | Delete `vault.db` + clear `wiki_vault/L*` + `wiki_vault/README.md` |

## Docker Deployment

Two-tier containerized setup via `docker-compose.yaml`:

```
┌─────────────────────────────────┐
│  brainuxt-backend (Bun/Nuxt)    │
│  :3000                          │
│  ┌───────────────────────────┐  │
│  │ .output/server/index.mjs  │  │
│  │ vault.db ← backend_db vol │  │
│  │ wiki_vault/ ← obsidian_   │  │
│  │              vault vol    │  │
│  └───────────────────────────┘  │
└──────────────┬──────────────────┘
               │ shared volume: obsidian_vault
┌──────────────┴──────────────────┐
│  obsidian-ui (KasmVNC)          │
│  :8443                          │
│  ┌───────────────────────────┐  │
│  │ /config/Obsidian/Vaults/  │  │
│  │   wiki_vault/             │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Dockerfile — Multi-stage Build

| Stage | Base Image | Purpose |
|-------|-----------|---------|
| `build` | `oven/bun:1.3.14` | Install deps, run `bun run build` |
| `runtime` | `oven/bun:1.3.14` | Copy `.output` and `node_modules`, run `index.mjs` |

### Volumes

| Volume | Mounted at | Purpose |
|--------|-----------|---------|
| `obsidian_vault` | `/app/wiki_vault` (shared) | Time-partitioned Markdown vault, accessible by both containers |
| `backend_db` | `/app/server/db` | SQLite database persistence |
| `obsidian_config` | `/config` | Obsidian UI preferences and plugins |

### Startup

```bash
MIMO_API_KEY="sk-..." docker compose up -d
```

The backend exposes port `3000`, the Obsidian browser UI exposes port `8443`. Both restart `unless-stopped`.
 `unless-stopped`.
