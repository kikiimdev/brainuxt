import { generateText } from "ai";

export default defineTask({
  meta: {
    name: "Synthesize L2",
    description: "Condenses raw L1 logs into L2 summaries every 12 hours",
  },
  async run() {
    console.log("🚀 Starting scheduled Tier 2 Macro Synthesis worker pass...");

    // Collect unsealed L1 summaries
    const unsealedL1 = db
      .prepare(`
    SELECT * FROM memories 
    WHERE level = 1 AND parent_id IS NULL AND sealed_at IS NULL
    ORDER BY created_at ASC 
    LIMIT 20
  `)
      .all() as any[];

    if (unsealedL1.length < 5) {
      return {
        result: "Skipped. Not enough high-level summary activity data entries to compile chapters.",
      };
    }

    const timestampString = new Date().toISOString().replace("T", " ").substring(0, 19);
    const l2MemoryId = generateId("mem");

    const unsealedTextStream = unsealedL1
      .map((summary) => `[${summary.created_at}] Cluster Summary: ${summary.content}`)
      .join("\n\n");

    try {
      const provider = useAiProvider(DEFAULT_AI_PROVIDER);
      const { text: chapterOutput } = await generateText({
        model: provider("mimo-v2-flash"),
        prompt: `You are a technical document architect. Review these development cluster summaries and organize them into an structured documentation chapter. Add clear markdown sections, high-level project statuses, and a final technical ledger table.\n\nCluster Summaries:\n${unsealedTextStream}`,
      });
      const embedding = await generateEmbedding(chapterOutput);
      const sharedTags = Array.from(new Set(unsealedL1.flatMap((l) => l.tags.split(",")))).join(
        ",",
      );

      const runTx = db.transaction(() => {
        db.prepare(`
        INSERT INTO memories (id, content, level, tags, created_at) VALUES (?, ?, 2, ?, ?)
      `).run(l2MemoryId, chapterOutput, sharedTags, timestampString);

        db.prepare(`
        INSERT INTO vec_memories (id, embedding) VALUES (?, ?)
      `).run(l2MemoryId, embedding);

        const updateL1 = db.prepare(`
        UPDATE memories SET parent_id = ?, sealed_at = ? WHERE id = ?
      `);
        for (const summary of unsealedL1) {
          updateL1.run(l2MemoryId, timestampString, summary.id);
        }
      });
      runTx();

      const allNodes = db.prepare(`SELECT * FROM memories ORDER BY created_at DESC`).all() as any[];
      for (const summary of unsealedL1) {
        await generateSingleWikiFile(summary, allNodes);
      }
      const newlyCreatedL2 = allNodes.find((n) => n.id === l2MemoryId);
      await generateSingleWikiFile(newlyCreatedL2, allNodes);
      await generateCentralIndex(allNodes);

      console.log(`💾 L2 Chapter compilation successful: Created Master Chapter ${l2MemoryId}`);
      return { result: "Success", chapterId: l2MemoryId, sealedCount: unsealedL1.length };
    } catch (error) {
      console.error("❌ L2 Macro Synthesis execution failure:", error);
      return { result: "Error", message: (error as Error).message };
    }
  },
});
