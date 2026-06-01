export default eventHandler(async (event) => {
  const log = useLogger(event);
  // 1. Calculate density distribution across memory tiers
  const densityRows = db
    .prepare(`
    SELECT level, COUNT(*) as count 
    FROM memories 
    GROUP BY level
  `)
    .all() as { level: number; count: number }[];

  const densities = {
    L0_leaf_logs: densityRows.find((r) => r.level === 0)?.count || 0,
    L1_branch_summaries: densityRows.find((r) => r.level === 1)?.count || 0,
    L2_root_chapters: densityRows.find((r) => r.level === 2)?.count || 0,
  };

  log.set({ densities });

  // 2. Extract all pending tasks alongside their parent memory tags
  const pendingTasks = db
    .prepare(`
    SELECT t.id, t.task_text, m.tags, m.created_at
    FROM todos t
    JOIN memories m ON m.id = t.memory_id
    WHERE t.is_completed = 0
    ORDER BY m.created_at DESC
  `)
    .all() as { id: string; task_text: string; tags: string; created_at: string }[];

  // 3. Group open tasks by project framework categories
  const projectDistribution: Record<string, number> = {};
  const projectTasks: Record<string, string[]> = {};

  for (const task of pendingTasks) {
    // Fallback to "generic" if no specific technical tag exists
    const projectTag = task.tags.split(",").filter((t) => t !== "seed")[0] || "generic";

    projectDistribution[projectTag] = (projectDistribution[projectTag] || 0) + 1;

    if (!projectTasks[projectTag]) projectTasks[projectTag] = [];
    projectTasks[projectTag].push(`[ ] ${task.task_text}`);
  }

  log.set({
    project: {
      pendingCount: pendingTasks.length,
      distribution: projectDistribution,
      backlog: Object.keys(projectTasks).reduce(
        (acc, key) => ({ ...acc, [key]: projectTasks[key]!.length }),
        {},
      ),
    },
  });

  return {
    success: true,
    timestamp: new Date().toISOString(),
    memory_densities: densities,
    total_open_loops: pendingTasks.length,
    project_metrics: {
      distribution: projectDistribution,
      backlog: projectTasks,
    },
  };
});
