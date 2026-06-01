#!/usr/bin/env bun
// bin/brainuxt.ts (Core Terminal Command Engine Layout)

const BACKEND_URL = "http://localhost:3000/api/memories";

const args = Bun.argv.slice(2);
const command = args[0]?.toLowerCase();

if (!command || command === "help" || command === "-h") {
  printHelpMenu();
  process.exit(0);
}

switch (command) {
  case "remember":
  case "save":
  case "log":
    await handleRemember(args.slice(1));
    break;

  case "recall":
  case "find":
  case "search":
    await handleRecall(args.slice(1));
    break;

  case "status":
  case "dashboard":
    await handleStatus();
    break;

  default:
    console.error(`\n❌ Unknown brainuxt operation parameter: "${command}"`);
    printHelpMenu();
    process.exit(1);
}

/**
 * Pushes raw markdown strings or task notes straight into the intake buffering queue.
 */
async function handleRemember(commandArgs: string[]) {
  const content = commandArgs.join(" ").trim();
  if (!content) {
    console.error("❌ Error: Missing note string content body.");
    process.exit(1);
  }

  // Detect explicit tagging patterns appended at the end of prompt inputs (e.g., --tag core,bug)
  const tagIndex = commandArgs.indexOf("--profile");
  const profile = tagIndex !== -1 ? commandArgs[tagIndex + 1] : "generic";
  const cleanContent = tagIndex !== -1 ? commandArgs.slice(0, tagIndex).join(" ") : content;

  try {
    const response = await fetch(`${BACKEND_URL}/remember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: cleanContent, profile }),
    });

    const data = (await response.json()) as any;
    if (data.success) {
      console.log(`\n📥 [Success] Cached to RAM Buffer! ID: \x1b[36m${data.memoryId}\x1b[0m`);
      console.log(
        `🏷️ Tags: [${data.tags?.join(", ")}] | Compressed: ${data.originalLength}b -> ${data.compressedLength}b`,
      );
    } else {
      console.error("❌ Ingestion Rejected:", data.message);
    }
  } catch (err) {
    console.error(
      "❌ Connectivity Crash: Ensure Bun backend server loop is running on port 3000.",
      err,
    );
  }
}

/**
 * Executes a hybrid semantic macro or deep relational FTS temporal lookback search query.
 */
async function handleRecall(commandArgs: string[]) {
  // Check for explicit structural limit modifiers inside user input strings (e.g. -l 1)
  const limitIndex = commandArgs.indexOf("-l");
  let limit = 3;
  let searchTerms = [...commandArgs];

  if (limitIndex !== -1 && commandArgs[limitIndex + 1]) {
    limit = parseInt(commandArgs[limitIndex + 1]!, 10);
    searchTerms.splice(limitIndex, 2);
  }

  const query = searchTerms.join(" ").trim();
  if (!query) {
    console.error("❌ Error: Provide keyword or semantic terms for execution lookup.");
    process.exit(1);
  }

  try {
    const response = await fetch(`${BACKEND_URL}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });

    const data = (await response.json()) as any;
    if (!data.success) {
      console.error("❌ Search Execution Halted:", data);
      return;
    }

    console.log(
      `\n🔍 \x1b[33mSearch Strategy Selected:\x1b[0m \x1b[1m${data.search_strategy.toUpperCase()}\x1b[0m\n`,
    );

    if (
      data.search_strategy === "semantic_macro_tree" ||
      data.search_strategy === "semantic_last_resort_weak"
    ) {
      // Print high-level structural document logs
      for (const row of data.results) {
        console.log(
          `--- \x1b[32mMacro Match Node (${row.id})\x1b[0m | Distance Score: ${row.distance?.toFixed(3)} ---`,
        );
        console.log(row.content);
        console.log(`\x1b[90mTags: ${row.tags}\x1b[0m\n`);
      }
    } else if (data.search_strategy === "relational_fts_granular_fallback") {
      // Print sequential chronological streams from the Temporal Machine
      for (const resultBlock of data.results) {
        console.log(
          `==================== \x1b[35mTimeline Window Context Stream\x1b[0m ====================`,
        );
        for (const log of resultBlock.context_stream) {
          const isTarget = log.role === "target";
          const prefix = isTarget ? `\x1b[31m🎯 [TARGET]\x1b[0m` : `\x1b[90m⏱️ [CONTEXT]\x1b[0m`;
          const contentColor = isTarget ? `\x1b[1m` : `\x1b[37m`;

          console.log(`${prefix} \x1b[36m${log.id}\x1b[0m | \x1b[90m${log.created_at}\x1b[0m`);
          console.log(`${contentColor}${log.content}\x1b[0m`);
          console.log(`\x1b[90mLabels: ${log.tags.join(", ")}\x1b[0m\n`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Connectivity Crash: Run Bun server engine background pools.", err);
  }
}

async function handleStatus() {
  try {
    const response = await fetch("http://localhost:3000/api/dashboard/stats");
    const data = (await response.json()) as any;

    if (!data.success) {
      console.error("❌ Failed to pull brainuxt metrics.");
      return;
    }

    console.log(`\n🧠 \x1b[1mBrainuxt State Dashboard\x1b[0m | \x1b[90m${data.timestamp}\x1b[0m`);
    console.log(`=======================================================`);

    console.log(`\n📊 \x1b[33mMemory Layer Densities:\x1b[0m`);
    console.log(
      `  Level 0 (Leaf Raw Logs):      \x1b[36m${data.memory_densities.L0_leaf_logs}\x1b[0m rows`,
    );
    console.log(
      `  Level 1 (Branch Summaries):   \x1b[36m${data.memory_densities.L1_branch_summaries}\x1b[0m rows`,
    );
    console.log(
      `  Level 2 (Root Chapters):      \x1b[36m${data.memory_densities.L2_root_chapters}\x1b[0m rows`,
    );

    console.log(`\n⚡ \x1b[31mOpen Action Loops: ${data.total_open_loops}\x1b[0m`);

    for (const project of Object.keys(data.project_metrics.backlog)) {
      const totalTasks = data.project_metrics.distribution[project];
      console.log(
        `\n📁 \x1b[34mProject Context: ${project.toUpperCase()}\x1b[0m (${totalTasks} tasks pending)`,
      );

      const allTasks = data.project_metrics.backlog[project];
      // 🎯 THE FIX: Slice the array to only print out the top 3 most recent entries
      const visibleTasks = allTasks.slice(0, 3);

      for (const task of visibleTasks) {
        console.log(`  \x1b[37m${task}\x1b[0m`);
      }

      // Append a neat tracking summary label if items remain out of terminal view
      if (totalTasks > 3) {
        console.log(
          `  \x1b[90m… and ${totalTasks - 3} more outstanding tasks in this context backlog\x1b[0m`,
        );
      }
    }
    console.log("\n");
    // oxlint-disable-next-line no-unused-vars
  } catch (err) {
    console.error("❌ Connectivity Crash: Server is offline.");
  }
}

function printHelpMenu() {
  console.log(`
🧠 \x1b[1mBrainUXT Hybrid Developer CLI Engine\x1b[0m
Usage: brainuxt <command> [arguments]

\x1b[32mCommands:\x1b[0m
  \x1b[36mremember [text]\x1b[0m          Intercepts text logs and targets them into the memory buffering pool.
                           Options: --profile [type] (e.g. build-log)
  
  \x1b[36mrecall [query]\x1b[0m           Queries the hybrid matrix with automatic chronological window lookbacks.
                           Options: -l [number] (Override result match entry limits)
        
  \x1b[36mstatus\x1b[0m                   Displays system metrics and pending backlogs.

\x1b[32mExamples:\x1b[0m
  brainuxt remember "TODO: Investigate cluster drops on SALAM-RINDU pipeline"
  brainuxt recall "cluster drops" -l 1

  `);
}

export {};
