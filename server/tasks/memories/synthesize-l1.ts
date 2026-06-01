import { generateText } from "ai";

export default defineTask({
  meta: {
    name: "Synthesize L1",
    description: "Condenses raw L0 logs into L1 summaries every 20 minutes",
  },
  async run() {
    console.log("🚀 Starting scheduled Tier 1 Synthesis worker pass...");

    // 1. Collect unsealed L0 logs
    const unsealedL0 = db
      .prepare(`
    SELECT * FROM memories 
    WHERE level = 0 AND parent_id IS NULL AND sealed_at IS NULL
    ORDER BY created_at ASC 
    LIMIT 50
  `)
      .all() as any[];

    if (unsealedL0.length < 10) {
      return {
        result: "Skipped. Not enough new data entries to warrant structural synthesis summaries.",
      };
    }

    const timestampString = new Date().toISOString().replace("T", " ").substring(0, 19);
    const l1MemoryId = generateId("mem");

    // Format the logs cleanly so the AI can ingest them easily
    const unsealedTextStream = unsealedL0
      .map((log) => `[${log.created_at}] (Tags: ${log.tags}): ${log.content}`)
      .join("\n\n");

    try {
      const provider = useAiProvider(DEFAULT_AI_PROVIDER);
      const { text: summaryOutput } = await generateText({
        model: provider("mimo-v2-flash"),
        prompt: `You are a developer memory synthesis engine. Review these raw development activity logs and distill them into a concise, high-level summary. Focus on extracting key patterns, recurring system errors, and completed/pending project milestones.\n\nRaw Activity Logs:\n${unsealedTextStream}`,
      });
      const embedding = await generateEmbedding(summaryOutput);

      // Extract shared tag context
      const sharedTags = Array.from(new Set(unsealedL0.flatMap((l) => l.tags.split(",")))).join(
        ",",
      );

      // 3. ATOMIC DB WRITE: Commit L1 summary and seal the old L0 logs
      const runTx = db.transaction(() => {
        // Save the new L1 node
        db.prepare(`
        INSERT INTO memories (id, content, level, tags, created_at) VALUES (?, ?, 1, ?, ?)
      `).run(l1MemoryId, summaryOutput, sharedTags, timestampString);

        db.prepare(`
        INSERT INTO vec_memories (id, embedding) VALUES (?, ?)
      `).run(l1MemoryId, embedding);

        // Seal the original L0 items and link them to their new L1 parent
        const updateL0 = db.prepare(`
        UPDATE memories SET parent_id = ?, sealed_at = ? WHERE id = ?
      `);
        for (const log of unsealedL0) {
          updateL0.run(l1MemoryId, timestampString, log.id);
        }
      });
      runTx();

      // 4. Update the local Obsidian vault files
      const allNodes = db.prepare(`SELECT * FROM memories ORDER BY created_at DESC`).all() as any[];
      for (const log of unsealedL0) {
        await generateSingleWikiFile(log, allNodes); // Redraws L0 file to show the lock icon 🔒
      }
      const newlyCreatedL1 = allNodes.find((n) => n.id === l1MemoryId);
      await generateSingleWikiFile(newlyCreatedL1, allNodes);
      await generateCentralIndex(allNodes);

      console.log(
        `💾 L1 Synthesis successful. Sealed ${unsealedL0.length} logs into Summary: ${l1MemoryId}`,
      );
      return { result: "Success", summaryId: l1MemoryId, sealedCount: unsealedL0.length };
    } catch (error) {
      console.error("❌ L1 Synthesis execution failure:", error);
      return { result: "Error", message: (error as Error).message };
    }
  },
});
