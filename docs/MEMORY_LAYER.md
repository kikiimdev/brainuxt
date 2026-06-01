# Memory Layer

Brainuxt's memory system ingests logs through a **RAM buffer**, auto-extracts tasks, applies AI tagging/embedding in background workers, and progressively compresses raw entries into a three-tier hierarchical tree. Search uses a dual-strategy approach (semantic vector → FTS5 temporal fallback).

## Ingestion Pipeline: Buffer + Background Workers

**Files:** `server/api/memories/remember.post.ts`, `server/utils/buffer.ts`

Memories don't hit the database immediately. They go through a two-phase pipeline:

### Phase 1: Parse & Queue (synchronous, instant)

1. **Line parsing** — Each line is checked for:
   - Checkbox syntax: `- [ ] task` or `- [x] completed task` → extracted to `todos` table
   - Prefix syntax: `TODO:`, `PROGRESS:`, `DONE:` — TODO creates a pending task, DONE marks existing tasks as resolved, PROGRESS is kept as context only
2. **TokenJuice compression** — Remaining clean text is compressed by profile
3. **`queueMemoryToBuffer()`** — Payload (id, compressed text, tasks) pushed to RAM buffer
4. **Instant response** — Client gets back immediately with `memoryId` and `taskCount`

### Phase 2: Background Flush (asynchronous)

The buffer flushes when **10 items accumulate** OR **5 seconds** elapse:

```typescript
const MAX_BUFFER_SIZE = 10;
const MAX_HOLD_TIME = 5000; // ms
```

On flush, `flushBufferToStorage()` processes all queued items with **`p-limit(5)`** — max 5 concurrent AI workers:

```
Per item (5 at a time):
  1. extractLabelsFromContent() → tags via LLM + regex
  2. generateEmbedding() → 384-dim vector via MiniLM
  ↳ Falls back to zero-vector + "telemetry,auto-fallback" tag on failure

Transaction (atomic, all items):
  INSERT memories + INSERT memories_fts + INSERT vec_memories + INSERT todos
```

The FTS5 index (`memories_fts`) is kept in sync via SQLite triggers (`AFTER INSERT`, `AFTER DELETE`).

## The Hierarchy

```
L2  Documentation Chapters    ← Autonomous cron (every 12h), ≥5 unsealed L1
│    (synthesize-l2)             Manual via POST /seal-l2
│
├── L1  Summarized Clusters   ← Autonomous cron (every 20min), ≥10 unsealed L0
│    (synthesize-l1)             Manual via POST /seal
│
└── L0  Raw Log Ledger        ← RAM buffer → background flush → DB
     (POST /remember)
```

## Cron Synthesis Tasks

### `synthesize-l1` — Every 20 minutes

**File:** `server/tasks/memories/synthesize-l1.ts`

1. Collects up to **50 unsealed L0** logs (`level = 0 AND parent_id IS NULL AND sealed_at IS NULL`)
2. **Threshold:** Requires ≥10 entries — skips if insufficient data
3. Formats logs as a chronological text stream
4. Feeds to LLM: *"Review these raw development activity logs and distill them into a concise, high-level summary."*
5. Generates embedding for the summary
6. Atomic transaction: INSERT L1 node, INSERT vec_memories, UPDATE all children with `parent_id` and `sealed_at`
7. Calls `generateSingleWikiFile()` per changed node + `generateCentralIndex()`

### `synthesize-l2` — Every 12 hours

**File:** `server/tasks/memories/synthesize-l2.ts`

1. Collects up to **20 unsealed L1** summaries (`level = 1 AND parent_id IS NULL AND sealed_at IS NULL`)
2. **Threshold:** Requires ≥5 entries
3. Feeds to LLM: *"Review these development cluster summaries and organize them into a structured documentation chapter."*
4. Same atomic transaction pattern as L1 (at L2 level)
5. Same surgical wiki update pattern

### Scheduling Configuration

In `nuxt.config.ts`:

```typescript
nitro: {
  scheduledTasks: {
    "*/20 * * * *": ["memories:synthesize-l1"],
    "0 */12 * * *": ["memories:synthesize-l2"],
  },
}
```

## Dual-Strategy Search

**File:** `server/api/memories/recall.post.ts`

The recall endpoint runs a **cascading search** across two strategies:

### Pass 1: Semantic Macro Tree (L1/L2)

- Embeds the query as 384-dim vector
- Queries `vec_memories` for `level > 0` (summaries and chapters only)
- Uses sqlite-vec MATCH with `k = limit`
- **Confidence threshold:** best distance ≤ **1.1**

If confident → returns as `search_strategy: "semantic_macro_tree"`.

### Pass 2: FTS5 Temporal Window Fallback (L0)

Triggered when semantic confidence is weak (distance > 1.1):

1. **Tokenizes query** — strips punctuation, splits on whitespace, joins with ` OR `
2. **FTS5 MATCH** on `memories_fts` for `level = 0`
3. **For each hit:** queries ±2 `rowid` neighbors to build a temporal context window
4. Returns as `search_strategy: "relational_fts_granular_fallback"` with `context_stream` arrays

```sql
-- Temporal window query per target
SELECT id, content, level, tags, created_at,
       (CASE WHEN id = ? THEN 'target' ELSE 'context' END) as match_role
FROM memories
WHERE level = 0 AND rowid >= ? - 2 AND rowid <= ? + 2
ORDER BY rowid ASC
```

Each result block contains the target hit and its chronological neighbors, enabling the `brainuxt recall` CLI to render a full timeline view.

### Pass 3: Last Resort

If FTS5 returns nothing, the weak semantic results are returned as `search_strategy: "semantic_last_resort_weak"`.

## Todo System

### Extraction

During `/remember` ingestion, tasks are parsed from:
- **Checkbox syntax:** `- [ ] Pending task` → `is_completed = 0`, `- [x] Done task` → `is_completed = 1`
- **Prefix syntax:** `TODO: Something` → `is_completed = 0`, `DONE: Something` → `is_completed = 1`
- **PROGRESS:** entries stay in content for AI context but don't create tasks
- **DONE:** entries are also kept in content for chronological context

### Toggle Endpoint

**File:** `server/api/todos/toggle.ts`

`GET /api/todos/toggle?id=...` or `POST /api/todos/toggle` with `{ "id": "..." }`:
- Flips `is_completed` (0→1 or 1→0)
- **Surgical wiki update:** Only regenerates the single `.md` file containing this task's parent memory + the central index — not the entire vault
- GET returns an HTML confirmation page (closes after 1.8s), POST returns JSON

### Wiki Integration

Each `.md` file includes an **Active Action Items** section with clickable toggle links:

```markdown
## 🗹 Active Action Items

- ⏳ **[TODO]** **Fix memory leak in transform bridge** [🎛️](http://localhost:3000/api/todos/toggle?id=task_abc) *(Logged: 2026-05-31)*
- 🟢 **[DONE]** ~~Update schema mappings~~ [🎛️](http://localhost:3000/api/todos/toggle?id=task_def) *(Logged: 2026-05-30)*
```

### Central Task Board

The wiki `README.md` index now includes a **Master Project Task Board** showing:
- Global metrics (completed vs total, percentage, progress bar)
- Recent 25 tasks sorted by status (uncompleted first) then newest
- Direct toggle links for each task

```markdown
## 🗹 Master Project Task Board (Recent 25 Actions)

> **Global Metrics:** **12** of **42** tasks closed out (**29%** efficiency score)
> `[■■■       ]`
```

## Vector Embedding Pipeline

Uses `Xenova/all-MiniLM-L6-v2` via HuggingFace Transformers with ONNX/WASM backend. Models cached at `.cache/brainuxt/models/`.

## Wiki Generation

**File:** `server/utils/ai-wiki.ts`

### Time-Partitioned Directory Structure

To handle large datasets, wiki files are now organized by `YYYY-MM` partitions:

```
wiki_vault/
├── README.md
├── L0_Log/
│   └── 2026-06/
│       └── 20260601_091212_L0_mem_xxx.md
├── L1_Summaries/
│   └── 2026-06/
│       └── 20260601_094500_L1_mem_yyy.md
└── L2_Chapters/
    └── 2026-06/
        └── 20260601_120000_L2_mem_www.md
```

### Sliding Window Optimization

`generateWikiFiles()` uses a **30-day sliding window** instead of full-table scans:

```sql
SELECT * FROM memories
WHERE created_at >= datetime('now', '-30 days') OR sealed_at IS NULL
ORDER BY created_at DESC
```

### Surgical Updates

`generateSingleWikiFile()` rewrites exactly one `.md` file — used by cron tasks and the todo toggle endpoint instead of full vault regeneration.

### Bidirectional Links with Time Partitions

Wiki links now include the time partition in their path:

```markdown
▲ **Parent Cluster Link:** [[L1_Summaries/2026-06/20260601_094500_L1_mem_zzz]]
▼ **Children Encapsulated Logs:**
- [[L0_Log/2026-05/20260531_184726_L0_mem_aaa]]
- [[L0_Log/2026-05/20260531_190145_L0_mem_bbb]]
```

### Frontmatter

```yaml
---
id: "mem_abc123"
level: L1
tags: [salam-rindu, meeting, alice]
timeline_partition: "2026-06"
created_at: "2026-06-01 09:54:56"
sealed_at: "2026-06-01 10:00:00"
---
```

### Descendant Todo Resolution

The **Active Action Items** section traverses the tree to find all todos related to any descendant node:

```typescript
const getDescendantIds = (id: string): string[] => {
  let ids = [id];
  const children = childrenMap.get(id) || [];
  for (const child of children) ids = ids.concat(getDescendantIds(child.id));
  return ids;
};
```

This means an L1 summary node shows tasks from all its child L0 logs, and an L2 chapter shows all descendant tasks.
