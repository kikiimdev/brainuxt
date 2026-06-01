// src/l2Engine.ts
import { db } from "./db";
import { generateEmbedding } from "./ai-models";
import { generateId } from "./utils"; // using your NanoID helper
import { generateWikiFiles } from "./ai-wiki";
import { generateText } from "ai";

interface L1Node {
  id: string;
  content: string;
  tags: string | null;
  created_at: string;
}

/**
 * Iterates through historical L1 nodes and condenses them into
 * long-term structural documentation chapters (L2).
 */
export async function runL2CompactionEngine(): Promise<number> {
  const timestamp = new Date().toISOString();

  // 1. Fetch uncompacted L1 nodes
  const unsealedL1Rows = db
    .prepare(`
    SELECT id, content, tags, created_at FROM memories
    WHERE level = 1 AND l2_sealed_at IS NULL
    ORDER BY created_at ASC
  `)
    .all() as L1Node[];

  // Threshold check: Wait until we have at least 2 distinct summaries to consolidate
  if (unsealedL1Rows.length < 2) {
    console.log("⏳ Not enough L1 summary nodes accumulated to justify an L2 consolidation step.");
    return 0;
  }

  console.log(`🚀 Executing L2 Macro Compaction loop across ${unsealedL1Rows.length} L1 nodes...`);

  // 2. Aggregate tag vectors to track scope domain
  const l2TagsSet = new Set<string>();
  unsealedL1Rows.forEach((row) => {
    if (row.tags) row.tags.split(",").forEach((t) => l2TagsSet.add(t.trim().toLowerCase()));
  });
  const l2TagsString = Array.from(l2TagsSet).join(",");

  // 3. Assemble compile matrix string context
  const clusterContext = unsealedL1Rows
    .map((row) => {
      return `### [Node Entry ${row.id}] (Compiled: ${row.created_at})\nTags: [${row.tags}]\n\n${row.content}\n---\n`;
    })
    .join("\n");

  try {
    const provider = useAiProvider(DEFAULT_AI_PROVIDER);
    const { text: l2ChapterContent } = await generateText({
      model: provider("mimo-v2-flash"),
      temperature: 0.3,
      system: {
        role: "system",
        content:
          "You are an elite principal software architect compiling internal development histories into a permanent engineering wiki repository book chapter. Analyze the incoming chronological project logs and combine them into a single, comprehensive, production-grade documentation guide. Do not use generic summary bullet-points—write explicit technical descriptions, clear API specifications, and architectural parameters based on the source text. Format exclusively in Markdown with clear headers.",
      },
      prompt: `Consolidate these short-term development summaries into a master L2 Documentation Chapter:\n\n${clusterContext}`,
    });

    const parentL2Id = generateId("mem");

    // 5. Generate local MiniLM mathematical weights for the macro block
    const l2Vector = await generateEmbedding(l2ChapterContent);

    // 6. Execute atomic SQLite storage commit transaction
    const runTransaction = db.transaction(() => {
      // A. Write the new master chapter entry into the core table at Level 2
      db.prepare(`
        INSERT INTO memories (id, content, level, tags, parent_id, created_at, sealed_at)
        VALUES (?, ?, 2, ?, NULL, CURRENT_TIMESTAMP, NULL)
      `).run(parentL2Id, l2ChapterContent, l2TagsString);

      // B. Save matching matrix weights to sqlite-vec table
      db.prepare(`
        INSERT INTO vec_memories (id, embedding)
        VALUES (?, ?)
      `).run(parentL2Id, l2Vector);

      // C. Seal the processed L1 summaries under this parent node window
      for (const row of unsealedL1Rows) {
        db.prepare(`
          UPDATE memories 
          SET parent_id = ?, l2_sealed_at = ? 
          WHERE id = ?
        `).run(parentL2Id, timestamp, row.id);
      }
    });

    runTransaction();
    console.log(`💾 Successfully published L2 Macro Chapter Node: ${parentL2Id}`);

    // 7. Regenerate workspace wiki structure
    await generateWikiFiles();

    return unsealedL1Rows.length;
  } catch (error) {
    console.error("❌ Failed to complete L2 macro chapter processing loop:", error);
    throw error;
  }
}
