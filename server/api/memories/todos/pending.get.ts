import { generateText } from "ai";
import { createError } from "evlog";

export default eventHandler(async (event) => {
  const log = useLogger(event);

  // 1. Fetch all raw L0 entries that have been logged to the system
  const rawEntries = db
    .prepare(`
    SELECT content, created_at FROM memories 
    WHERE level = 0 
    ORDER BY created_at ASC
  `)
    .all() as { content: string; created_at: string }[];

  log.set({ rawEntries: { count: rawEntries.length } });

  if (rawEntries.length === 0) {
    return { count: 0, pendingTasks: [] };
  }

  const ledgerContext = rawEntries.map((e) => `[${e.created_at}]: ${e.content}`).join("\n");
  log.set({ ledger: { context: ledgerContext } });

  const provider = useAiProvider(DEFAULT_AI_PROVIDER);
  const { text: textResult } = await generateText({
    model: provider("mimo-v2-flash"),
    temperature: 0.3,
    system: {
      role: "system",
      content:
        "You are an expert project tracker. Your job is to analyze a chronological ledger of logs containing both 'TODO' items and subsequent 'PROGRESS' updates. Determine which tasks are fully or partially resolved by newer updates, and output ONLY the remaining uncompleted or untouched TODO tasks. Format your output strictly as a JSON array of strings containing the original uncompleted todo statements, with no chat text surrounding it.",
    },
    prompt: `Analyze this ledger and isolate the remaining pending tasks:\n\n${ledgerContext}`,
  });

  log.set({ result: { textLength: textResult.length } });

  try {
    // Parse the clean JSON array coming out of the model
    // Strip out any accidental markdown fences if present
    const cleanJsonString = textResult.replace(/```json|```/g, "").trim();
    const activeTodos = JSON.parse(cleanJsonString);
    log.set({ result: { pendingTodos: activeTodos.length } });

    return {
      count: activeTodos.length,
      pendingTasks: activeTodos,
    };
  } catch {
    throw createError({
      status: 500,
      message: "Failed to parse model layout stream directly.",
      why: "Failed to parse model layout stream directly.",
      fix: "Please try again later.",
    });
  }
});
