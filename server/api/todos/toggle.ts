import { createError } from "evlog";

export default eventHandler(async (event) => {
  const method = event.method;
  let taskId: string | null = null;

  // 1. Normalize ingestion stream parameters across GET and POST protocols
  if (method === "GET") {
    const query = getQuery(event);
    taskId = (query.id as string) || null;
  } else if (method === "POST") {
    const body = await readBody(event);
    taskId = body?.id || null;
  }

  if (!taskId) {
    throw createError({
      status: 400,
      message: "Bad Request Matrix.",
      why: "A target task ID tracking signature is required to perform a state modification switch.",
    });
  }

  // 2. Fetch active status parameters to evaluate context bounds
  const currentTodo = db
    .prepare(`
    SELECT is_completed, task_text FROM todos WHERE id = ?
  `)
    .get(taskId) as { is_completed: number; task_text: string } | undefined;

  if (!currentTodo) {
    throw createError({
      status: 404,
      message: "Target task record tracking identifier reference missing.",
      why: `The identifier reference string '${taskId}' does not exist inside the active ledger schema layout maps.`,
    });
  }

  // Calculate the flipped binary matrix state
  const nextState = currentTodo.is_completed === 1 ? 0 : 1;

  // 3. Commit state change inside an isolated atomic transaction sweep
  const runToggleTx = db.transaction(() => {
    db.prepare(`
      UPDATE todos 
      SET is_completed = ? 
      WHERE id = ?
    `).run(nextState, taskId);
  });
  runToggleTx();

  console.log(
    `🎛️ State change executed for task [${taskId}]: Flipped completion indicator to ${nextState}`,
  );

  ////
  const allNodes = db
    .prepare(`
      SELECT id, content, level, tags, parent_id, created_at, sealed_at 
      FROM memories
      ORDER BY created_at DESC
    `)
    .all() as {
    id: string;
    content: string;
    level: number;
    tags: string | null;
    parent_id: string | null;
    created_at: string;
    sealed_at: string | null;
  }[];

  await generateCentralIndex(allNodes);

  const targetTodo = db.prepare(`SELECT memory_id FROM todos WHERE id = ?`).get(taskId) as {
    memory_id: string;
  };
  if (targetTodo) {
    const parentNode = allNodes.find((n) => n.id === targetTodo.memory_id);
    if (parentNode) {
      // We can extract a mini single-file generation helper from your wiki generator loop
      // to surgically re-write just this ONE single file instead of the whole vault.
      await generateSingleWikiFile(parentNode, allNodes);
    }
  }

  console.log(
    `🎯 Surgical updates completed. Total operations: 2 disk writes instead of ${allNodes.length}.`,
  );

  ////

  // 4. Trigger filesystem down-sync compilation loop instantly
  // This updates your markdown layouts right after the database table updates.
  await generateWikiFiles();

  // 5. Present structural visual return block responses
  if (method === "GET") {
    // If clicked from the Obsidian UI, return a clean HTML conformation banner page
    event.node.res.setHeader("Content-Type", "text/html");
    return `
      <body style="font-family:system-ui,sans-serif; background:#111; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh;">
        <div style="border:1px solid #333; padding:2rem; border-radius:12px; background:#161616; text-align:center; max-width:450px;">
          <h2 style="color:${nextState === 1 ? "#4caf50" : "#ff9800"}">🗹 Task Ledger Status Updated Successfully</h2>
          <p style="font-size:1.1rem; color:#ccc;">"${currentTodo.task_text}"</p>
          <p style="color:#888; font-size:0.9rem;">State change flipped to <b>${nextState === 1 ? "CLOSED [x]" : "OPEN [ ]"}</b>. Your Obsidian Vault index files have been automatically regenerated.</p>
          <small style="color:#555;">ID Code reference trace: ${taskId}</small>
        </div>
        <script>setTimeout(() => window.close(), 1800);</script>
      </body>
    `;
  }

  return {
    success: true,
    taskId,
    taskText: currentTodo.task_text,
    newState: nextState,
    message: `Task state flipped to ${nextState === 1 ? "completed" : "pending"} and markdown layout regenerated.`,
  };
});
