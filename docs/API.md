# API Reference

All endpoints are served under `/api/`.

---

## Memories — `POST /api/memories/remember`

Ingest a raw memory entry. Parses checkboxes and TODO/PROGRESS/DONE prefixes, separates tasks into the `todos` table, applies TokenJuice compression to remaining content, then queues into the RAM buffer for background processing.

### Request Body

```json
{
  "content": "TODO: Fix memory leak inside the transform bridge.\n- [x] Update schema mappings\nPROGRESS: Investigating cluster drops.",
  "profile": "generic",
  "tagConfig": {
    "enable_llm": true,
    "enable_regex": true,
    "max_tags": 6,
    "watch_keywords": ["SALAM-RINDU"]
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `content` | string | Yes | — | Raw log text. Supports multiline, checkbox syntax (`- [ ]` / `- [x]`), and `TODO:`/`PROGRESS:`/`DONE:` prefixes |
| `profile` | string | No | `"generic"` | TokenJuice compression profile |
| `tagConfig` | object | No | — | Tag extraction configuration (see shared schema) |

### Response `200`

```json
{
  "success": true,
  "memoryId": "mem_ZxxBOLMzprcU",
  "originalLength": 134,
  "compressedLength": 102,
  "taskCount": 2,
  "message": "Memory processed successfully and queued for disk sync buffer allocation."
}
```

The response returns immediately — embeddings and tag extraction happen in the background via `flushBufferToStorage()`.

### Errors

| Status | When |
|--------|------|
| `400` | `content` is missing |

---

## Search — `POST /api/memories/recall`

Multi-strategy search with automatic fallback routing.

### Request Body

```json
{
  "query": "What blocks the SALAM-RINDU deployment?",
  "limit": 5,
  "level": 1,
  "tag": "salam-rindu"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `limit` | number | No | `5` | Max results to return |


### Response `200` — Semantic Macro (high confidence, distance ≤ 1.1)

```json
{
  "success": true,
  "search_strategy": "semantic_macro_tree",
  "results": [
    {
      "id": "mem_abc123",
      "content": "SUMMARY: SALAM-RINDU deployment blocked...",
      "level": 1,
      "tags": "salam-rindu,meeting",
      "distance": 0.234,
      "search_type": "semantic_macro"
    }
  ]
}
```

### Response `200` — FTS Temporal Fallback (low confidence, distance > 1.1)

```json
{
  "success": true,
  "search_strategy": "relational_fts_granular_fallback",
  "results": [
    {
      "target_id": "mem_def456",
      "search_type": "relational_fts_temporal_window",
      "context_stream": [
        {
          "id": "mem_before",
          "role": "context",
          "content": "Prior log entry...",
          "tags": ["salam-rindu"],
          "created_at": "2026-06-01 10:00:00"
        },
        {
          "id": "mem_target",
          "role": "target",
          "content": "PROGRESS: Investigating packet drops on cluster node B.",
          "tags": ["salam-rindu", "telemetry"],
          "created_at": "2026-06-01 10:01:00"
        },
        {
          "id": "mem_after",
          "role": "context",
          "content": "Next log entry...",
          "tags": ["telemetry"],
          "created_at": "2026-06-01 10:02:00"
        }
      ]
    }
  ]
}
```

The temporal window grabs ±2 rowid neighbors around each FTS5 match target, giving chronological context.

### Search Strategy Table

| Strategy | Trigger | Searches | Output |
|----------|---------|----------|--------|
| `semantic_macro_tree` | Best vector distance ≤ 1.1 | L1/L2 via sqlite-vec | Flat node list |
| `relational_fts_granular_fallback` | Vector distance > 1.1 AND FTS5 hits exist | L0 via FTS5 + rowid windows | Timeline windows with context_stream |
| `semantic_last_resort_weak` | Vector distance > 1.1 AND no FTS5 hits | Returns weak semantic results as-is | Flat node list |

### Errors

| Status | When |
|--------|------|
| `400` | `query` is missing |

---

## Seal — `POST /api/memories/seal`

Triggers L0→L1 compaction. Finds all unsealed L0 memories (must have `parent_id IS NULL AND sealed_at IS NULL`), feeds them to the LLM for summarization, creates a parent L1 summary node, and seals the children.

### Request Body

_None required._

### Response `200`

```json
{
  "success": true,
  "components_sealed": 4
}
```

---

## Seal L2 — `POST /api/memories/seal-l2`

Triggers L1→L2 macro compaction. Requires **≥2 unsealed L1 nodes** (must have `parent_id IS NULL AND sealed_at IS NULL`).

### Request Body

_None required._

### Response `200`

```json
{
  "success": true,
  "components_sealed": 3,
  "message": "L1 nodes consolidated into a master L2 documentation chapter."
}
```

---

## Pending Todos — `GET /api/memories/todos/pending`

AI-extracted pending tasks from the L0 raw log ledger.

### Request Body

_None._

### Response `200`

```json
{
  "count": 2,
  "pendingTasks": [
    "Get signed MoU agreement document before SALAM-RINDU streaming cluster goes live",
    "Fix intermittent race conditions on SATU-DATA packet buffers"
  ]
}
```

---

## Dashboard — `GET /api/dashboard/stats`

Full system metrics including tier densities and project-tagged todo backlogs.

### Request Body

_None._

### Response `200`

```json
{
  "success": true,
  "timestamp": "2026-06-01T10:15:00.000Z",
  "memory_densities": {
    "L0_leaf_logs": 4500,
    "L1_branch_summaries": 15,
    "L2_root_chapters": 3
  },
  "total_open_loops": 42,
  "project_metrics": {
    "distribution": {
      "salam-rindu": 12,
      "nexus-core": 8,
      "satu-data": 10
    },
    "backlog": {
      "salam-rindu": ["[ ] Fix cluster drops on node B", "[ ] Update schema mappings"],
      "nexus-core": ["[ ] Optimize vector processing loops"]
    }
  }
}
```

Groups todos by project tag (derived from the parent memory's `tags` field, filtering out `seed` tags).

---

## Todo Toggle — `GET /api/todos/toggle` | `POST /api/todos/toggle`

Flips a task's completion status and surgically updates only the affected wiki files.

### GET

```
GET /api/todos/toggle?id=task_abc123
```

Returns an HTML confirmation page (designed for clickable links in Obsidian `.md` files).

### POST

```json
{
  "id": "task_abc123"
}
```

### Response `200`

```json
{
  "success": true,
  "taskId": "task_abc123",
  "taskText": "Fix cluster drops on node B",
  "newState": 1,
  "message": "Task state flipped to completed and markdown layout regenerated."
}
```

Instead of regenerating the entire vault, it only rewrites the single affected `.md` file and the central index.

### Errors

| Status | When |
|--------|------|
| `400` | No `id` provided |
| `404` | Task ID not found |

---

## Test Seed — `GET /api/_test/seed`

Bulk-seeds the database with synthetic historical data for load testing.

### Request Body

_None._

Seeds:
- **4,500 L0 memories** across 90 days of lookback (50/day)
- **Random mock embeddings** (384-dim Float32Array)
- **~1,125 todos** (25% of memories get a task, older ones may be completed)
- Tags include real project names (SALAM-RINDU, SATU-DATA, etc.) and compression profiles

Clears all existing `memories`, `vec_memories`, and `todos` before seeding.

### Response `200`

```json
{
  "success": true
}
```

Logs detailed stats to the server console.

---

## Full Example Session

```bash
# 1. Bulk seed 4,500 entries for load testing
curl -X GET http://localhost:3000/api/_test/seed

# 2. Ingest a memory with task extraction
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "TODO: Fix memory leak in transform bridge.\n- [x] Update schema\nPROGRESS: Investigating cluster drops on node B."}'

# 3. Wait for buffer flush (auto after 5s or 10 items), then search
curl -X POST http://localhost:3000/api/memories/recall \
  -H "Content-Type: application/json" \
  -d '{"query": "cluster drops on production nodes"}'

# 4. Check dashboard
curl -X GET http://localhost:3000/api/dashboard/stats

# 5. Toggle a task
curl -X POST http://localhost:3000/api/todos/toggle \
  -H "Content-Type: application/json" \
  -d '{"id": "task_abc123"}'

# 6. Manual seal (if needed beyond cron)
curl -X POST http://localhost:3000/api/memories/seal
```
