// server/api/memories/recall.post.ts
import { z } from "zod/v4";
import { createError } from "evlog";

const bodySchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(5),
  level: z.number().optional(),
  tag: z.string().optional(),
});

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parseAsync);
  const queryString = body?.query || "";
  const limit = body?.limit || 3;

  if (!queryString) {
    throw createError({
      status: 400,
      message: "Bad Request Matrix.",
      why: "Query text parameter is required.",
      fix: "Please provide a query text parameter.",
    });
  }

  // ⚠️ CRITICAL NOTICE: Removed the high-overhead static hydration line from here.
  // Your utils/buffer.ts engine already takes care of updating memories_fts on the fly!

  // Generate vector weights for the incoming user query
  const queryVector = await generateEmbedding(queryString);

  // =========================================================================
  // PASS 1: High-Speed Semantic Macro Search (L1/L2 Tier Shield)
  // =========================================================================
  const vectorSql = `
    SELECT m.id, m.content, m.level, m.tags, v.distance 
    FROM vec_memories v
    JOIN memories m ON m.id = v.id
    WHERE v.embedding MATCH ? 
        AND k = ?               
        AND m.level > 0
    ORDER BY v.distance ASC
    `;

  const macroResults = db.prepare(vectorSql).all(queryVector, limit) as any[];

  const HIGH_CONFIDENCE_THRESHOLD = 1.1;
  const bestMatchDistance = macroResults[0]?.distance ?? 999;

  if (macroResults.length > 0 && bestMatchDistance <= HIGH_CONFIDENCE_THRESHOLD) {
    console.log(
      `🎯 Semantic Match Success (Distance: ${bestMatchDistance.toFixed(3)}). Returning macro summaries.`,
    );

    return {
      success: true,
      search_strategy: "semantic_macro_tree",
      results: macroResults.map((r) => ({ ...r, search_type: "semantic_macro" })),
    };
  }

  // =========================================================================
  // PASS 2: FALLBACK TRIGGERED - Temporal FTS Context Windowing Machine
  // =========================================================================
  console.log(
    `⏳ Weak semantic confidence (${bestMatchDistance.toFixed(3)}). Dropping down to Temporal FTS Log Fallback...`,
  );

  const terms = queryString
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const cleanSearchQuery = terms.join(" OR ");
  console.log({ terms, cleanSearchQuery });

  // 1. We now select the native rowid alongside the record ID to establish position coordinates
  const ftsSql = `
    SELECT DISTINCT m.id, m.rowid
    FROM memories_fts f
    JOIN memories m ON m.id = f.id
    WHERE memories_fts MATCH ? AND m.level = 0
    ORDER BY m.created_at DESC
    LIMIT ?
    `;

  try {
    const granularTargets = db.prepare(ftsSql).all(cleanSearchQuery, limit) as {
      id: string;
      rowid: number;
    }[];

    if (granularTargets.length === 0) {
      return {
        success: true,
        search_strategy: "semantic_last_resort_weak",
        results: macroResults.map((r) => ({ ...r, search_type: "semantic_macro" })),
      };
    }

    const timelineResults = [];

    // 2. TEMPORAL LOOKBACK SCAN LOOP
    // For each structural target keyword hit, extract the neighboring context buffer
    for (const target of granularTargets) {
      const windowSql = `
        SELECT id, content, level, tags, created_at,
               (CASE WHEN id = ? THEN 'target' ELSE 'context' END) as match_role
        FROM memories
        WHERE level = 0 
          AND rowid >= ? - 2 
          AND rowid <= ? + 2
        ORDER BY rowid ASC
      `;

      const temporalStream = db
        .prepare(windowSql)
        .all(target.id, target.rowid, target.rowid) as any[];

      // Package the surrounding log stream neatly as a timeline sequence segment
      timelineResults.push({
        target_id: target.id,
        search_type: "relational_fts_temporal_window",
        context_stream: temporalStream.map((row) => ({
          id: row.id,
          role: row.match_role, // Identifies if this is the target match line or supporting history
          content: row.content,
          tags: row.tags.split(",").filter(Boolean),
          created_at: row.created_at,
        })),
      });
    }

    return {
      success: true,
      search_strategy: "relational_fts_granular_fallback",
      results: timelineResults,
    };
  } catch (_ftsError) {
    console.error("❌ FTS Fallback Parse Collapse:", _ftsError);
    return {
      success: true,
      search_strategy: "semantic_error_fallback",
      results: macroResults.map((r) => ({ ...r, search_type: "semantic_macro" })),
    };
  }
});
