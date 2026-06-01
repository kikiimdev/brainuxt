// oxlint-disable no-unused-vars
import { default as pLimit } from "p-limit";

export interface BufferedMemoryPayload {
  memoryId: string;
  compressedContent: string;
  //   tagsString: string;
  //   embedding: Float32Array;
  tasksToInsert: { text: string; completed: number }[];
  tasksToResolveInline: string[];
  profile: string;
}

const MAX_BUFFER_SIZE = 10;
const MAX_HOLD_TIME = 5000;

let memoryBuffer: BufferedMemoryPayload[] = [];
let flushTimeout: Timer | null = null;

/**
 * Pushes fully analyzed semantic structures into the RAM buffer.
 * Instantly yields control back to the network route thread layer.
 */
export function queueMemoryToBuffer(payload: BufferedMemoryPayload): void {
  memoryBuffer.push(payload);

  console.log(
    `📥 Memory cached in RAM buffer [${memoryBuffer.length}/${MAX_BUFFER_SIZE}]: ${payload.memoryId}`,
  );

  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      console.log("⏱️ Dynamic time threshold breached. Flushing RAM cache...");
      flushBufferToStorage();
    }, MAX_HOLD_TIME);
  }

  if (memoryBuffer.length >= MAX_BUFFER_SIZE) {
    console.log("📦 Buffer volume ceiling reached. Executing batch disk flush pass...");
    flushBufferToStorage();
  }
}

/**
 * Core Database Batch Writer: Flushes buffered data pools inside a single SQLite transaction,
 * and updates only the necessary Markdown files.
 */
export async function flushBufferToStorage(): Promise<void> {
  if (memoryBuffer.length === 0) return;

  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  const batchToCommit = [...memoryBuffer];
  memoryBuffer = []; // Open RAM queue instantly

  const totalMemories = batchToCommit.length;
  const startTime = performance.now();

  try {
    // 🎯 THE FIX: Limit concurrent AI workers to 5 at a time
    // Prevents crashing your machine or hitting rate limits during bulk flushes
    const limitConcurrency = pLimit(5);

    console.log(
      `⚙️  Background Engine: Enhancing ${totalMemories} logs with AI embeddings & tag extraction...`,
    );

    const enrichedPayloads = await Promise.all(
      batchToCommit.map((payload) =>
        limitConcurrency(async () => {
          // Fallback handlers if the AI API errors out under high load
          let tagsString = "";
          let embedding: Float32Array<ArrayBufferLike>;

          try {
            const aiData = await extractLabelsFromContent(payload.compressedContent);
            tagsString = aiData.tagsString;
            embedding = await generateEmbedding(payload.compressedContent);
          } catch (aiError) {
            console.warn(
              `⚠️  AI Synthesis failed for node ${payload.memoryId}, falling back to heuristics.`,
            );
            tagsString = "telemetry,auto-fallback";
            // oxlint-disable-next-line unicorn/no-new-array
            embedding = new Array(384).fill(0) as unknown as Float32Array<ArrayBufferLike>; // Zero-vector fallback
          }

          return { ...payload, tagsString, embedding };
        }),
      ),
    );

    // Write the fully enriched records to your database tables in a single transaction
    const runBatchTx = db.transaction(() => {
      for (const payload of enrichedPayloads) {
        db.prepare(`INSERT INTO memories (id, content, level, tags) VALUES (?, ?, 0, ?)`).run(
          payload.memoryId,
          payload.compressedContent,
          payload.tagsString,
        );
        db.prepare(`INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)`).run(
          payload.memoryId,
          payload.compressedContent,
          payload.tagsString,
        );
        db.prepare(`INSERT INTO vec_memories (id, embedding) VALUES (?, ?)`).run(
          payload.memoryId,
          payload.embedding,
        );

        for (const task of payload.tasksToInsert) {
          db.prepare(
            `INSERT INTO todos (id, memory_id, task_text, is_completed) VALUES (?, ?, ?, ?)`,
          ).run(generateId("task"), payload.memoryId, task.text, task.completed);
        }
      }
    });

    runBatchTx();

    const processingDuration = performance.now() - startTime;
    console.log(
      `💾 Disk Flush Complete: Processed ${totalMemories} records in ${processingDuration.toFixed(2)}ms.`,
    );
  } catch (error) {
    console.error("❌ Critical Background Processing Failure:", error);
    memoryBuffer = [...batchToCommit, ...memoryBuffer]; // Recover memory logs
  }
}
