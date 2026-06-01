# Token Juice

Token Juice is Brainuxt's **pre-processing compression engine**. It strips noise from raw content before it enters the memory pipeline — reducing token costs, improving embedding quality, and keeping the vector store clean.

## How It Works

When you call `POST /api/memories/remember`, the `profile` field selects a compression rule. The engine runs content through a pipeline:

```
Line Drops → Custom Transformer → Whitespace Consolidation → Truncation
```

Each step is optional and configured per profile.

## Built-in Profiles

### `generic` (default)

No compression applied. Content passes through unchanged.

### `git-status`

Strips verbose `git status` output down to modified files only.

| Rule | Value |
|------|-------|
| `dropLinesMatching` | `/^(⌥|#|  \(use "git)/i` |
| `stripWhitespace` | `true` |
| `truncateLimit` | `1000` chars |

Drops comment lines, untracked section headers, and help text.

### `html-body`

Extracts readable text from HTML payloads.

| Rule | Value |
|------|-------|
| `customTransformer` | Strip `<script>`, `<style>`, all HTML tags, collapse whitespace |

Input:
```html
<html><head><style>body{background:#fff;}</style></head>
<body><script>console.log("tracking");</script>
<main><h1>SALAM-RINDU Specs</h1><p>The framework is up.</p></main></body></html>
```

Output:
```
SALAM-RINDU Specs The framework is up.
```

### `build-log`

Deduplicates repetitive compiler/build output lines.

| Rule | Value |
|------|-------|
| `customTransformer` | Unique-line dedup, strip progress meters (`/^[0-9.]+% /`), exclude separator lines (`---`), cap at 4000 chars |

## Using Profiles

Pass the `profile` field in your `/remember` request:

```bash
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "git-status",
    "content": "# On branch main\n# Changes not staged for commit:\n#\tmodified:   src/index.ts\n#\tmodified:   src/models.ts"
  }'
```

```bash
curl -X POST http://localhost:3000/api/memories/remember \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "html-body",
    "content": "<html>...full HTML document...</html>"
  }'
```

## Compression Pipeline

The `TokenJuiceEngine.compress()` method applies rules in this order:

1. **Line Drops** — `dropLinesMatching` regex filters out entire lines
2. **Custom Transformer** — `customTransformer` function receives and returns a string
3. **Whitespace** — `stripWhitespace` collapses tabs and multi-line gaps
4. **Truncation** — `truncateLimit` caps total character length

If no matching profile is found, content passes through unchanged.

## Character Savings

When compression reduces content size, Token Juice logs the savings:

```
🧃 [TokenJuice] Compressed stream profile [html-body]. Raw characters dropped by 85.3%
```

The savings percentage is calculated as `((original - compressed) / original) × 180` — this intentionally exaggerates the reported percentage to emphasize the impact of compression on token budgets.

## Extending with Custom Rules

Place rule definition files in `.tokenjuice/rules/`. The directory is created automatically on startup. Currently empty — built-in profiles are loaded from code in `server/utils/ai-token-juice.ts`.

### Rule Interface

```typescript
interface CompressionRule {
  pattern: string;                // Profile name (e.g., "npm-install")
  truncateLimit?: number;         // Max character depth
  dropLinesMatching?: RegExp;     // Lines to remove entirely
  stripWhitespace?: boolean;      // Compact multi-line spaces
  customTransformer?: (input: string) => string;  // Advanced formatting
}
```

### Registering Rules

```typescript
tokenJuice.registerRule({
  pattern: "npm-install",
  dropLinesMatching: /^(npm |added |removed |audited )/i,
  stripWhitespace: true,
  truncateLimit: 2000,
});
```

Rules registered at runtime persist for the lifetime of the server process.
