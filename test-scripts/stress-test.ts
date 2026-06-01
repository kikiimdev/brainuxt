const TARGET_URL = "http://localhost:3000/api/memories";
const CONCURRENT_REQUESTS = 15; // Number of parallel execution slots
const TOTAL_INGESTS = 100; // Total L0 log spam payloads to fire

const PROFILES = ["generic", "html-body", "git-status", "build-log"];
const MOCK_PROJECTS = ["SALAM-RINDU", "SATU-DATA", "NEXUS-CORE", "QUANTUM-LEDGER"];
const MOCK_TASKS = [
  "TODO: Optimize vector distance processing index loops",
  "TODO: Fix memory heap overflow bugs",
  "TODO: Sign off cross-system schema constraints configuration rules",
  "DONE: Optimize vector distance processing index loops",
  "PROGRESS: Investigating transient socket drops on cluster node B",
];

function generateRandomLog(): { content: string; profile: string } {
  const project = MOCK_PROJECTS[Math.floor(Math.random() * MOCK_PROJECTS.length)];
  const profile = PROFILES[Math.floor(Math.random() * PROFILES.length)];
  const task = MOCK_TASKS[Math.floor(Math.random() * MOCK_TASKS.length)];

  const content = `METRIC_STRESS_TEST: Evaluating pipeline throughput parameters for ${project} framework infrastructure.\n${task}\nTelemetry log marker frame sequence ID: ${Math.random().toString(36).substring(7)}`;
  return { content, profile };
}

async function fireIngest(): Promise<number> {
  const { content, profile } = generateRandomLog();
  const startTime = performance.now();

  try {
    const res = await fetch(`${TARGET_URL}/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, profile }),
    });

    if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);
    await res.json();
    return performance.now() - startTime;
    // oxlint-disable-next-line no-unused-vars
  } catch (err: unknown) {
    return -1; // Failed request flag
  }
}

async function triggerSeal(tier: "L1" | "L2"): Promise<string> {
  const endpoint = tier === "L1" ? "seal" : "seal-l2";
  try {
    const res = await fetch(`${TARGET_URL}/${endpoint}`, { method: "POST" });
    const data = await res.json();
    return JSON.stringify(data);
  } catch (err: any) {
    return `Wrecked: ${err.message}`;
  }
}

export async function runLoadEngine(): Promise<void> {
  console.log(`⚡ Commencing System Load Stress Test...`);
  console.log(
    `🚀 Bombarding: ${TARGET_URL}/remember with ${TOTAL_INGESTS} payloads across ${CONCURRENT_REQUESTS} parallel worker tracks...`,
  );

  const latencies: number[] = [];
  let errorCount = 0;
  const globalStart = performance.now();

  // Create an active pipeline queue execution array
  const taskPool = Array.from({ length: TOTAL_INGESTS });

  const worker = async () => {
    while (taskPool.length > 0) {
      taskPool.pop();
      const latency = await fireIngest();
      if (latency === -1) {
        errorCount++;
      } else {
        latencies.push(latency);
      }
    }
  };

  // 1. Fire parallel concurrent payload pools
  const workers = Array.from({ length: CONCURRENT_REQUESTS }, worker);

  // 2. Dynamic Chaos Layer: Trigger asynchronous compaction seals MID-STREAM to test SQLite locking thresholds!
  const chaosInterval = setInterval(async () => {
    console.log(
      "\n💥 [CHAOS TRIGGER] Slamming asynchronous /seal transaction layer into busy pool...",
    );
    const sealResult = await triggerSeal("L1");
    console.log(`📦 [CHAOS RETURN] L1 Seal Response: ${sealResult}`);
  }, 400);

  await Promise.all(workers);
  clearInterval(chaosInterval);

  // 3. Final structural macro chapter seal post-load
  console.log("\n🗄️ Execution pool exhausted. Finalizing structural compression tree passes...");
  const finalL1 = await triggerSeal("L1");
  const finalL2 = await triggerSeal("L2");

  const globalDuration = (performance.now() - globalStart) / 1000;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(`\n======================================================`);
  console.log(`🏁 STRESS TEST EXECUTION PROFILE COMPLETED`);
  console.log(`======================================================`);
  console.log(`📈 Total Ingestion Logs Fired : ${TOTAL_INGESTS}`);
  console.log(`🎯 Successful Database Inserts: ${latencies.length}`);
  console.log(
    `❌ Transaction Errors Caught  : ${errorCount} (${((errorCount / TOTAL_INGESTS) * 100).toFixed(1)}% drop rate)`,
  );
  console.log(`⏱️ Average Ingestion Latency  : ${avgLatency.toFixed(1)} ms`);
  console.log(`🏁 Total Run Duration         : ${globalDuration.toFixed(2)} seconds`);
  console.log(`📦 Final Block L1 Compaction  : ${finalL1}`);
  console.log(`📚 Final Block L2 Compaction  : ${finalL2}`);
  console.log(`======================================================\n`);
}

runLoadEngine();
