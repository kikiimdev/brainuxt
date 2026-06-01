// oxlint-disable no-unused-vars
import { write } from "bun";
import { mkdir } from "fs/promises";
import { join } from "path";
import { db } from "./db";
import { getStandardWikiFileName } from "./utils";

interface WikiNode {
  id: string;
  content: string;
  level: number;
  tags: string | null;
  parent_id: string | null;
  created_at: string;
  sealed_at: string | null;
}

// const vaultRoot = join(homedir(), ".cache", "memory-layer", "wiki_vault");
const projectRoot = process.env.MEMORY_LAYER_DIR || process.cwd();
const vaultRoot = join(projectRoot, "wiki_vault");

console.log(`🗄️ Vault folder location: ${vaultRoot}`);

/**
 * Strips heavy markdown formatting characters to generate clean titles
 */
function cleanTitle(text: string, maxLength = 35): string {
  // Strip out markdown formatting headers, asterisks, and link characters
  const clean = text
    .replace(/[#*`_[\]]/g, "")
    .replace(/\n/g, " ")
    .trim();

  // Create a URL/File safe slug string
  const slug = clean
    .replace(/[^a-zA-Z0-9\s-]/g, "") // Keep alphanumeric characters and spaces
    .replace(/\s+/g, "_"); // Turn spaces into clean underscores

  return slug.length > maxLength ? `${slug.substring(0, maxLength)}` : slug || "Untitled_Node";
}

/**
 * Transforms an ISO string (2026-05-31 18:47:26) to a pure, sortable string (20260531_184726)
 */
function formatFileDatetime(isoString: string): string {
  return isoString
    .replace("-", "")
    .replace("-", "")
    .replace(" ", "_")
    .replace(":", "")
    .replace(":", "");
}

/**
 * Reads database state and down-compiles it into an Obsidian-compatible Markdown system.
 * Executed automatically following a transaction compaction lock.
 */

export async function generateWikiFiles(): Promise<void> {
  console.log(`📂 Commencing Delta-Window Vault compilation layout at: ${vaultRoot}`);

  // 1. Establish pristine environment layout folders safely
  await mkdir(join(vaultRoot, "L0_Log"), { recursive: true });
  await mkdir(join(vaultRoot, "L1_Summaries"), { recursive: true });
  await mkdir(join(vaultRoot, "L2_Chapters"), { recursive: true });

  // 2. Fetch recent target nodes (Sliding window optimization threshold)
  const recentNodes = db
    .prepare(`
    SELECT id, content, level, tags, parent_id, created_at, sealed_at 
    FROM memories
    WHERE created_at >= datetime('now', '-30 days')
       OR sealed_at IS NULL
    ORDER BY created_at DESC
  `)
    .all() as WikiNode[];

  // 3. REUSE: Process individual markdown layout sheets sequentially
  for (const node of recentNodes) {
    // Pass the current single node alongside the active reference cache array block!
    await generateSingleWikiFile(node, recentNodes);
  }

  // 4. Update the centralized table dashboard view panel
  await generateCentralIndex(recentNodes);
  console.log(`✨ Sliding-window compile sequence completed successfully.`);
}

/**
 * Surgically rewrites exactly one Markdown file inside the Obsidian vault.
 * Prevents full-vault disk thrashing when a single task state toggles.
 */
export async function generateSingleWikiFile(node: WikiNode, allNodes: WikiNode[]): Promise<void> {
  const nodeMap = new Map<string, WikiNode>();
  const childrenMap = new Map<string, WikiNode[]>();

  for (const n of allNodes) {
    nodeMap.set(n.id, n);
    if (n.parent_id) {
      if (!childrenMap.has(n.parent_id)) childrenMap.set(n.parent_id, []);
      childrenMap.get(n.parent_id)!.push(n);
    }
  }

  // 1. DYNAMIC TIME-SHARD PARSING
  let levelDirectory = "L0_Log";
  if (node.level === 1) levelDirectory = "L1_Summaries";
  if (node.level === 2) levelDirectory = "L2_Chapters";

  // Extracts "YYYY-MM" cleanly from your standard timestamp format (e.g., "2026-06-01 09:54:56" -> "2026-06")
  const yearMonthPartition = node.created_at.substring(0, 7);

  // 🎯 Resulting Path: vaultRoot/L0_Log/2026-06/fileName.md
  const targetDirectory = join(vaultRoot, levelDirectory, yearMonthPartition);
  const fileName = getStandardWikiFileName(node);
  const filePath = join(targetDirectory, fileName);

  // Guarantee chronological folder tree structural integrity on disk
  await mkdir(targetDirectory, { recursive: true });

  let fileContent = "";
  const parsedTags = node.tags
    ? node.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const formattedYamlTags = parsedTags.length > 0 ? `[${parsedTags.join(", ")}]` : "[]";

  // Build frontmatter properties
  fileContent += `---\n`;
  fileContent += `id: "${node.id}"\n`;
  fileContent += `level: L${node.level}\n`;
  fileContent += `tags: ${formattedYamlTags}\n`;
  fileContent += `timeline_partition: "${yearMonthPartition}"\n`;
  fileContent += `created_at: "${node.created_at}"\n`;
  fileContent += `sealed_at: ${node.sealed_at ? `"${node.sealed_at}"` : "null"}\n`;
  fileContent += `---\n\n`;

  fileContent += `# Memory Node View\n\n`;
  fileContent += `${node.content}\n\n`;
  fileContent += `---\n\n`;

  // --- (Dynamic Checklist Processing logic remains unchanged) ---
  fileContent += `## 🗹 Active Action Items\n\n`;
  const getDescendantIds = (id: string): string[] => {
    let ids: string[] = [id];
    const children = childrenMap.get(id) || [];
    for (const child of children) ids = ids.concat(getDescendantIds(child.id));
    return ids;
  };
  const targetedMemoryIds = getDescendantIds(node.id);
  const placeholders = targetedMemoryIds.map(() => "?").join(",");
  const associatedTodos = db
    .prepare(
      `SELECT id, task_text, is_completed, created_at FROM todos WHERE memory_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...targetedMemoryIds) as any[];

  if (associatedTodos.length === 0) {
    fileContent += `*No actionable tracking items registered for this node branch scope.*\n\n`;
  } else {
    for (const todo of associatedTodos) {
      const isDone = todo.is_completed === 1;
      const statusIndicator = isDone ? `🟢 **[DONE]**` : `⏳ **[TODO]**`;
      const displayPayloadText = isDone ? `~~${todo.task_text}~~` : `**${todo.task_text}**`;
      fileContent += `- ${statusIndicator} ${displayPayloadText} [🎛️](${process.env.APP_URL || "http://localhost:3000"}/api/todos/toggle?id=${todo.id}) *(Logged: ${todo.created_at.split(" ")[0]})*\n`;
    }
    fileContent += `\n`;
  }
  fileContent += `---\n\n`;

  // 2. TIMELINE-SHARDED UPWARD TREE LINKAGE
  fileContent += `## 🌳 Memory Tree Lineage Graph\n\n`;
  if (node.parent_id && nodeMap.has(node.parent_id)) {
    const parent = nodeMap.get(node.parent_id)!;
    const parentDir = parent.level === 1 ? "L1_Summaries" : "L2_Chapters";
    const parentTimePartition = parent.created_at.substring(0, 7);
    const exactParentName = getStandardWikiFileName(parent).replace(".md", "");

    // Links accurately using absolute path: [[Level/Year-Month/File]]
    fileContent += `▲ **Parent Cluster Link:** [[${parentDir}/${parentTimePartition}/${exactParentName}]] (${parent.created_at})\n\n`;
  } else if (node.level > 0) {
    fileContent += `▲ **Parent Cluster Link:** *Root Hierarchy Level*\n\n`;
  }

  // 3. TIMELINE-SHARDED DOWNWARD TREE LINKAGE
  if (childrenMap.has(node.id)) {
    fileContent += `▼ **Children Encapsulated Logs:**\n`;
    const children = childrenMap.get(node.id)!;
    for (const child of children) {
      const childDir = child.level === 0 ? "L0_Log" : "L1_Summaries";
      const childTimePartition = child.created_at.substring(0, 7);
      const exactChildName = getStandardWikiFileName(child).replace(".md", "");

      fileContent += `- [[${childDir}/${childTimePartition}/${exactChildName}]] (${child.created_at})\n`;
    }
  } else if (node.level === 0) {
    fileContent += `▼ **Children Encapsulated Logs:** *Leaf Stream Element*\n`;
  }

  await write(filePath, fileContent);
}

/**
 * Builds a chronological index file at the vault base layer for immediate bird's-eye access
 */

export async function generateCentralIndex(nodes: WikiNode[]): Promise<void> {
  let indexContent = `# 🧠 AI Memory Layer Index\n\n`;
  indexContent += `> **System Metric Ledger** • 🗄️ Total Active Nodes: **${nodes.length}** | 📝 L0 Logs: **${nodes.filter((n) => n.level === 0).length}** | 🟢 L1: **${nodes.filter((n) => n.level === 1).length}** | 🔵 L2: **${nodes.filter((n) => n.level === 2).length}**\n\n`;
  indexContent += `*Last synced compilation check: ${new Date().toISOString()}*\n\n`;
  indexContent += `---\n\n`;

  // ==========================================
  // 🗹 UPDATED: MASTER TASK BOARD (Capped to Recent 25)
  // ==========================================
  indexContent += `## 🗹 Master Project Task Board (Recent 25 Actions)\n`;

  // Query total counts first to keep metrics accurate
  const counts = db
    .prepare(`
    SELECT COUNT(*) as total, SUM(is_completed) as completed FROM todos
  `)
    .get() as { total: number; completed: number | null };

  const totalCount = counts.total;
  const completedCount = counts.completed || 0;

  // Pull ONLY the 25 most critical recent actions (Uncompleted first, then newest)
  const recentTodos = db
    .prepare(`
        SELECT id, task_text, is_completed, created_at 
        FROM todos 
        ORDER BY is_completed ASC, created_at DESC
        LIMIT 25
    `)
    .all() as { id: string; task_text: string; is_completed: number; created_at: string }[];

  if (totalCount === 0) {
    indexContent += `*No actionable tasks have been registered across the journal stream yet.*\n\n`;
  } else {
    const completionPercentage = ((completedCount / totalCount) * 100).toFixed(0);
    indexContent += `> **Global Metrics:** **${completedCount}** of **${totalCount}** tasks closed out (**${completionPercentage}%** efficiency score)\n>\n`;
    indexContent += `> \`[${"■".repeat(Math.round((completedCount / totalCount) * 10))}${" ".repeat(10 - Math.round((completedCount / totalCount) * 10))}]\`\n\n`;

    for (const todo of recentTodos) {
      const isDone = todo.is_completed === 1;
      const statusIndicator = isDone ? `🟢 **[DONE]**` : `⏳ **[TODO]**`;
      const displayPayloadText = isDone ? `~~${todo.task_text}~~` : `**${todo.task_text}**`;

      // 🔗 Appending the seamless local interaction deep-link webhook trigger
      indexContent += `- ${statusIndicator} ${displayPayloadText} [🎛️](${process.env.APP_URL}/api/todos/toggle?id=${todo.id}) *(Logged: ${todo.created_at.split(" ")[0]})*\n`;
    }
    if (totalCount > 25) {
      indexContent += `\n> 🔍 *And ${totalCount - 25} more historical tasks archived in the database relational ledger.*\n`;
    }
    indexContent += `\n`;
  }

  indexContent += `---\n\n`;

  //   // ==========================================
  //   // 2. EMBED THE INTERACTIVE EXPLORER WIDGET
  //   // ==========================================
  //   indexContent += `## 🎛️ Interactive Vault Data Explorer\n`;
  //   indexContent += `Adjust parameters below to filter across project scopes, taxonomy tags, or tree depth levels in real time.\n\n`;

  //   const safeDataPayload = JSON.stringify(
  //     nodes.map((n) => {
  //       const firstLine = n.content.trim().split("\n")[0]!;
  //       const displayTitle = firstLine
  //         .replace(/[#*`>-]/g, "")
  //         .trim()
  //         .substring(0, 80);
  //       return {
  //         id: n.id,
  //         title: displayTitle,
  //         level: `L${n.level}`,
  //         tags: n.tags ? n.tags.split(",") : [],
  //         date: n.created_at,
  //       };
  //     }),
  //     null,
  //     2,
  //   );

  //   indexContent += `<GenerateWidget height="500px">\n\`\`\`json\n`;
  //   indexContent += JSON.stringify(
  //     {
  //       widgetSpec: {
  //         height: "500px",
  //         prompt: `Build an interactive data explorer grid for local engineering memories. Data State: ${safeDataPayload}. Input elements: Level Filter (dropdown: All, L0, L1, L2), Search Term (text input matching titles or tags). Visuals: Render a clean data table grid showing Date, Level, Title, and dynamic clickable pill tags.`,
  //       },
  //     },
  //     null,
  //     2,
  //   );
  //   indexContent += `\n\`\`\`\n</GenerateWidget>\n\n---\n\n`;

  // ==========================================
  // 3. MASTER DOCUMENTATION CHAPTERS (L2 - Capped to Recent 25)
  // ==========================================
  indexContent += `## 📚 Recent Master Documentation Chapters (L2)\n`;
  const l2Nodes = nodes.filter((n) => n.level === 2);
  const slicedL2 = l2Nodes.slice(0, 25);

  if (slicedL2.length === 0) indexContent += `*No macro chapters compiled yet.*\n`;
  for (const node of slicedL2) {
    const exactFileName = getStandardWikiFileName(node).replace(".md", "");
    const timePartition = node.created_at.substring(0, 7);
    const tagsArr = node.tags
      ? node.tags
          .split(",")
          .map((t) => `\`#${t.trim()}\``)
          .join(" ")
      : "";

    indexContent += `- [[L2_Chapters/${timePartition}/${exactFileName}]] — ${tagsArr} (${node.created_at})\n`;
  }
  if (l2Nodes.length > 25)
    indexContent += `- *...and ${l2Nodes.length - 25} older compiled macro chapters.*\n`;

  // ==========================================
  // 4. SUMMARIZED MEMORY CLUSTERS (L1 - Capped to Recent 25)
  // ==========================================
  indexContent += `\n## 📦 Recent Summarized Memory Clusters (L1)\n`;
  const l1Nodes = nodes.filter((n) => n.level === 1);
  const slicedL1 = l1Nodes.slice(0, 25);

  if (slicedL1.length === 0) indexContent += `*No high-level index summaries compiled yet.*\n`;
  for (const node of slicedL1) {
    const exactFileName = getStandardWikiFileName(node).replace(".md", "");
    const timePartition = node.created_at.substring(0, 7);
    const tagsArr = node.tags
      ? node.tags
          .split(",")
          .map((t) => `\`#${t.trim()}\``)
          .join(" ")
      : "";
    const statusFlag = node.sealed_at ? "🔒" : "⏳";

    indexContent += `- ${statusFlag} [[L1_Summaries/${timePartition}/${exactFileName}]] — ${tagsArr} (${node.created_at})\n`;
  }
  if (l1Nodes.length > 25)
    indexContent += `- *...and ${l1Nodes.length - 25} older short-term summary modules.*\n`;

  // ==========================================
  // 5. RECENT ACTIVITY LEDGER STREAM (L0 - Capped to Recent 25)
  // ==========================================
  indexContent += `\n## 📝 Recent Activity Ledger Stream (L0)\n`;
  const l0Nodes = nodes.filter((n) => n.level === 0);
  const slicedL0 = l0Nodes.slice(0, 25);

  if (slicedL0.length === 0) indexContent += `*No raw memory stream inputs processed.*\n`;
  for (const node of slicedL0) {
    const exactFileName = getStandardWikiFileName(node).replace(".md", "");
    const timePartition = node.created_at.substring(0, 7);
    const tagsArr = node.tags
      ? node.tags
          .split(",")
          .map((t) => `\`#${t.trim()}\``)
          .join(" ")
      : "";
    const statusFlag = node.sealed_at ? "🔒" : "⏳";

    indexContent += `- ${statusFlag} [[L0_Log/${timePartition}/${exactFileName}]] — ${tagsArr} (${node.created_at})\n`;
  }
  if (l0Nodes.length > 25)
    indexContent += `- *...and ${l0Nodes.length - 25} historical event stream logs archived internally.*\n`;

  // Securely write out file block update
  await write(join(vaultRoot, "README.md"), indexContent);
}
