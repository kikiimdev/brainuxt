import { db } from "./db";
import { generateEmbedding } from "./ai-models";
import { generateId } from "./utils";
import { generateWikiFiles } from "./ai-wiki";
import { generateText } from "ai";

interface MemoryNode {
  id: string;
  content: string;
  level: number;
  tags: string | null;
}

/**
 * Mock or external wrapper for your summarization LLM step.
 * Replace this with an actual fetch request to your external API (OpenAI, Anthropic, Ollama, etc.)
 */
async function callLLMForSummary(contents: string[]): Promise<string> {
  // Compile the L0 entries into a clear markdown stream for the model to review
  const formattedLedger = contents.map((text, idx) => `[Entry #${idx + 1}]: ${text}`).join("\n\n");

  const provider = useAiProvider(DEFAULT_AI_PROVIDER);
  const { text: summaryResult } = await generateText({
    model: provider("mimo-v2-flash"),
    temperature: 0.3,
    system: {
      role: "system",
      content:
        "You are the core compression layer of an AI Memory Tree. Your job is to take a raw chronological stream of real-time entries (L0 Logs) and synthesize them into a unified, high-density conceptual summary (L1 Node). Maintain crucial developer metrics, explicit design decisions, and core context. Format using clean Markdown with distinct headers. Do not use conversational preambles.",
    },
    prompt: `Here is the unsealed L0 memory ledger block to process:\n\n${formattedLedger}`,
  });

  return summaryResult;
}

/**
 * Core engine pass: Scans for raw unsealed memories, compresses them into upper branches,
 * indexes vectors, sets sealed_at timestamps, and down-syncs the Markdown Wiki view.
 */
export async function runCompactionEngine(): Promise<number> {
  const timestamp = new Date().toISOString();

  // 1. Fetch all L0 memories that have not yet been sealed
  const unsealedRows = db
    .prepare(`
      SELECT id, content, level, tags FROM memories 
      WHERE level = 0 AND sealed_at IS NULL
      ORDER BY created_at ASC
    `)
    .all() as MemoryNode[];

  // ==========================================================
  // 🛡️ THE GATEWAY SHIELD: Volume Batch Enforcement
  // Prevents upstream API rate-limiting spikes by blocking tiny/empty seals.
  // ==========================================================
  const MINIMUM_BATCH_LIMIT = 1; // Adjust this scale coefficient based on your needs

  if (unsealedRows.length < MINIMUM_BATCH_LIMIT) {
    // Gracefully exit the script pass early. No network tokens wasted!
    console.log(
      `⏳ Compaction step deferred: ${unsealedRows.length}/${MINIMUM_BATCH_LIMIT} logs accumulated.`,
    );
    return 0;
  }

  console.log(
    `📦 Batch threshold reached! Processing ${unsealedRows.length} unsealed L0 memories into an L1 tree branch...`,
  );

  const parentTagsSet = new Set<string>();
  for (const row of unsealedRows) {
    if (row.tags) {
      row.tags.split(",").forEach((tag) => {
        const cleanTag = tag.trim().toLowerCase();
        if (cleanTag) parentTagsSet.add(cleanTag);
      });
    }
  }
  const parentTagsString = Array.from(parentTagsSet).join(","); // e.g. "wasm,onnx,routing"

  // Extract text payloads to build the hierarchical compression context
  const rawContents = unsealedRows.map((row) => row.content);

  try {
    // 2. Fire external or local LLM abstraction layer to execute the tree consolidation pass
    const structuralSummary = await callLLMForSummary(rawContents);
    const parentId = generateId("mem");

    // 3. Generate vectors using the local ONNX runtime (~/.cache/memory-layer/models)
    const summaryVector = await generateEmbedding(structuralSummary);

    // 4. Begin an atomic SQLite transaction to guarantee relational integrity
    const runTransaction = db.transaction(() => {
      // A. Insert the new L1 parent node summary into the core table
      db.prepare(`
        INSERT INTO memories (id, content, level, tags, parent_id, created_at, sealed_at)
        VALUES (?, ?, 1, ?, NULL, CURRENT_TIMESTAMP, ?)
      `).run(parentId, structuralSummary, parentTagsString, timestamp);

      // B. Track vectors directly within sqlite-vec Virtual Table
      // Float32Array maps straight into native blob bindings
      db.prepare(`
        INSERT INTO vec_memories (id, embedding)
        VALUES (?, ?)
      `).run(parentId, summaryVector);

      // C. Map existing unsealed children to this new parent, and close their ingestion window
      for (const child of unsealedRows) {
        db.prepare(`
          UPDATE memories 
          SET parent_id = ?, sealed_at = ? 
          WHERE id = ?
        `).run(parentId, timestamp, child.id);

        // Optional: Generate individual embeddings for children if raw semantic lookup is needed
        // For efficiency, we are indexing the hierarchical tree nodes here.
      }
    });

    // Execute database changes safely
    runTransaction();

    console.log(
      `💾 Successfully generated parent L1 node: ${parentId} and indexed its vector space.`,
    );

    // 5. Trigger down-sync to the local read-only Markdown directory/Obsidian Vault
    await generateWikiFiles();

    return unsealedRows.length;
  } catch (error) {
    console.error("❌ Failed to complete compaction loop processing layer:", error);
    throw error;
  }
}
