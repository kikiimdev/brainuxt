# Full test

```bash
# Log 1: Kickoff
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "MEETING: Syncing with @Alice regarding the critical system integration path between SALAM-RINDU and SATU-DATA frameworks."}'

# Log 2: Initial feature work progress
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "PROGRESS: Handled base layout scaffolding for SALAM-RINDU integration hooks. Bug A squashed cleanly, feature C tests passing."}'

curl -X POST http://localhost:3000/api/memories/seal

# Log 3: Technical blocker discovered
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "PROGRESS: Found intermittent race conditions on the pipeline pipeline while testing SATU-DATA packet buffers. Bug B is currently blocked by this."}'

# Log 4: Administrative blocker discovered
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "MEETING: Mid-week checkpoint with @Alice. We cannot take the SALAM-RINDU streaming cluster live without an officially signed MoU agreement document."}'

curl -X POST http://localhost:3000/api/memories/seal

curl -X POST http://localhost:3000/api/memories/seal-l2

curl -X POST http://localhost:3000/api/memories/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Give me a complete timeline and progress update on SALAM-RINDU including what is solved, what blockers are outstanding, and what we discussed with Alice.",
    "limit": 1
  }'

curl -X GET http://localhost:3000/api/memories/todos/pending
```

## Token Juice

```bash
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "html-body",
    "content": "<html><head><style>body {background: #fff;}</style></head><body><script>console.log(\"tracking\");</script><main><h1>SALAM-RINDU Core Specifications Documentation</h1><p>The framework is up and running.</p></main></body></html>"
  }'

curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "git-status",
    "content": "# On branch main\n# Your branch is up to date with origin/main.\n# \n# Changes not staged for commit:\n#   (use \"git add <file>...\" to update what will be committed)\n#   (use \"git restore <file>...\" to discard changes in working directory)\n#\tmodified:   src/index.ts\n#\tmodified:   src/models.ts\nno changes added to commit (use \"git add\" and/or \"git commit -a\")"
  }'
```

## Todo Test

```bash
# =========================================================================
# DAY 1: Kickoff & Task Definition
# =========================================================================

# Log 1: Define outstanding requirements using the explicit TODO prefix
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "MEETING: Syncing with @Alice regarding the critical system integration path between SALAM-RINDU and SATU-DATA frameworks.\nTODO: Fix Bug A layout scaffolding\nTODO: Resolve Bug B race conditions"}'

# Verify Step: Check your terminal response here.
# It will report "tasks_found: 2" (Both items are recorded as pending/is_completed=0)


# =========================================================================
# DAY 2: Code Resolution & Auto-Checking Trigger
# =========================================================================

# Log 2: Using the explicit DONE prefix to auto-resolve a pending task
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "DONE: Fix Bug A layout scaffolding\nPROGRESS: Feature C tests are passing, but Bug B is proving tough."}'

# Verify Step: The system reads "DONE: Fix Bug A layout scaffolding".
# It triggers your SQLite transaction, finds the open task from Day 1 matching that exact text,
# and automatically updates its state to is_completed=1!


# =========================================================================
# COMPACTION & SEARCH EVALUATION
# =========================================================================

# Seal your logs into L1 summaries
curl -X POST http://localhost:3000/api/memories/seal

# Log an administrative update later in the week
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "MEETING: Mid-week checkpoint with @Alice. We cannot take the SALAM-RINDU streaming cluster live without an officially signed MoU agreement document."}'

# Seal remaining items to L1 and roll up to an L2 Chapter
curl -X POST http://localhost:3000/api/memories/seal
curl -X POST http://localhost:3000/api/memories/seal-l2

# Run your presentation query
curl -X POST http://localhost:3000/api/memories/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Give me a complete timeline and progress update on SALAM-RINDU including what is solved, what blockers are outstanding, and what we discussed with Alice.",
    "limit": 1
  }'
```

## Seed

```bash
curl -X GET http://localhost:3000/api/_test/seed

curl -X POST http://localhost:3000/api/memories/seal
```
