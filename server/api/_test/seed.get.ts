export default eventHandler(async () => {
  // Configure how much mock data you want to inject for the scale test
  const NUM_DAYS_LOOKBACK = 90; // Populates 3 months of history
  const LOGS_PER_DAY = 50; // Total L0 log nodes written per day (4,500 total rows)

  const COMPRESSION_PROFILES = ["generic", "html-body", "git-status", "build-log"];
  const MICRO_PROJECTS = ["SALAM-RINDU", "SATU-DATA", "NEXUS-CORE", "QUANTUM-LEDGER"];
  const ACTION_ITEMS = [
    "Fix transient socket drops on cluster node B",
    "Optimize vector distance processing index loops",
    "Clear heap allocation memory leaks in transformation bridge",
    "Patch buffer overflows on integration packet pipeline",
    "Update schema mapping validations for configuration rules",
  ];

  /**
   * Generates a mock Float32Array to fill your sqlite-vec vector table index space
   */
  function generateMockEmbedding(dimensions = 384): Float32Array {
    const arr = new Float32Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      arr[i] = Math.random() * 2 - 1; // Populate with standardized floating weights
    }
    return arr;
  }

  async function seedMassiveDatabase() {
    console.log(`\n🏗️ Starting high-density database seeding sequence...`);
    const startTime = performance.now();

    let totalL0Count = 0;
    let totalTodoCount = 0;

    // 1. Wrap the entire bulk injection pass inside a single atomic SQL Transaction
    // This tells SQLite to bypass disk sync operations until the entire loop finishes.
    const executeBatchTx = db.transaction(() => {
      // Clear out any old state indexes to ensure clean telemetry measurements
      db.prepare("DELETE FROM todos").run();
      db.prepare("DELETE FROM memories").run();
      db.prepare("DELETE FROM vec_memories").run();

      const stmtMem = db.prepare(`
      INSERT INTO memories (id, content, level, tags, parent_id, created_at, sealed_at)
      VALUES (?, ?, 0, ?, NULL, datetime('now', ?), datetime('now', ?))
    `);

      const stmtVec = db.prepare(`
      INSERT INTO vec_memories (id, embedding) VALUES (?, ?)
    `);

      const stmtTodo = db.prepare(`
      INSERT INTO todos (id, memory_id, task_text, is_completed, created_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `);

      // 2. Loop backwards through time to generate a realistic timeline ledger
      for (let day = NUM_DAYS_LOOKBACK; day >= 0; day--) {
        for (let logNum = 0; logNum < LOGS_PER_DAY; logNum++) {
          const project = MICRO_PROJECTS[Math.floor(Math.random() * MICRO_PROJECTS.length)];
          const profile =
            COMPRESSION_PROFILES[Math.floor(Math.random() * COMPRESSION_PROFILES.length)];
          const action = ACTION_ITEMS[Math.floor(Math.random() * ACTION_ITEMS.length)];

          // Calculate offset timestamp intervals safely
          const minutesOffset = -(day * 24 * 60 + logNum * 15);
          const timeModifierString = `${minutesOffset} minutes`;

          const id = generateId("mem");
          const isSealed = day > 1 ? 1 : 0; // Simulate older entries as already sealed
          const sealModifierString = isSealed ? `${minutesOffset + 10} minutes` : null;

          const content = `STRESS_TEST_SEED: Ingesting streaming pipeline frame context metrics for ${project}.\nProfile signature matched: ${profile}.\nSequence sequence footprint: ${Math.random().toString(36).substring(5)}`;
          const tags = `seed,${project?.toLowerCase()},${profile}`;

          // Insert into the core relational table
          stmtMem.run(id, content, tags, timeModifierString, sealModifierString);

          // Inject a mock vector embedding array
          const mockVec = generateMockEmbedding();
          stmtVec.run(id, mockVec);
          totalL0Count++;

          // 3. Randomly embed task checklist records into a 25% slice of the data stream
          if (Math.random() < 0.25) {
            const taskId = generateId("task");
            const isCompleted = day > 2 ? (Math.random() > 0.3 ? 1 : 0) : 0; // Simulate historical item completion

            stmtTodo.run(taskId, id, `${project}: ${action}`, isCompleted, timeModifierString);
            totalTodoCount++;
          }
        }
      }
    });

    // Execute transaction chunk
    await executeBatchTx();

    const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`======================================================`);
    console.log(`🏁 DATABASE SEEDING ROUTINE COMPLETED IN ${durationSec}s`);
    console.log(`======================================================`);
    console.log(`📝 Total Raw L0 Memory Rows Injected : ${totalL0Count}`);
    console.log(`🧠 Total Vector Index Weights Generated: ${totalL0Count}`);
    console.log(`🗹 Total Relational Tasks Registered  : ${totalTodoCount}`);
    console.log(`======================================================\n`);
  }

  await seedMassiveDatabase();

  return {
    success: true,
  };
});
