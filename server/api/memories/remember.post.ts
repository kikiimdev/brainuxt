// server/api/memories/remember.post.ts
import { z } from "zod/v4";
import { tagConfigSchema } from "#shared/schema/tag-config";
import { createError } from "evlog";

const bodySchema = z.object({
  content: z.string(),
  tagConfig: z.optional(tagConfigSchema),
  profile: z.string().optional(),
});

export default eventHandler(async (event) => {
  const log = useLogger(event);
  const {
    content,
    tagConfig,
    profile = "generic",
  } = await readValidatedBody(event, bodySchema.parseAsync);
  log.set({ body: { content, tagConfig, profile } });

  if (!content) {
    throw createError({
      status: 400,
      message: "Missing content.",
      why: "Content is required.",
      fix: "Please provide content.",
    });
  }

  const memoryId = generateId("mem");
  log.set({ memory: { memoryId } });

  const lines = content.split("\n");
  log.set({ content: { lineCount: lines.length } });

  const tasksToInsert: { text: string; completed: number }[] = [];
  const tasksToResolveInline: string[] = [];
  const cleanContentLines: string[] = [];

  // 1. Unified Parsing Pass (Remains identical)
  for (const line of lines) {
    const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    const prefixMatch = line.match(/^(TODO|PROGRESS|DONE):\s+(.+)$/i);

    if (checkboxMatch) {
      const isCompleted = checkboxMatch[1]!.toLowerCase() === "x" ? 1 : 0;
      tasksToInsert.push({ text: checkboxMatch[2]!.trim(), completed: isCompleted });
    } else if (prefixMatch) {
      const prefix = prefixMatch[1]!.toUpperCase();
      const taskText = prefixMatch[2]!.trim();

      if (prefix === "TODO") {
        // Keeps tracking task distribution clean
        tasksToInsert.push({ text: taskText, completed: 0 });

        // 🎯 Keep it in the text log stream so your AI/FTS indexes can see it!
        cleanContentLines.push(line);
      } else if (prefix === "DONE") {
        tasksToResolveInline.push(taskText);
        cleanContentLines.push(line);
      } else if (prefix === "PROGRESS") {
        cleanContentLines.push(line);
      }
    } else {
      cleanContentLines.push(line);
    }
  }

  log.set({ content: { taskCount: tasksToInsert.length } });

  const remainingText = cleanContentLines.join("\n");
  const compressedContent = tokenJuice.compress(remainingText, profile);
  log.set({
    content: { originalLength: content.length, compressedLength: compressedContent.length },
  });

  queueMemoryToBuffer({
    memoryId,
    compressedContent,
    profile,
    tasksToInsert,
    tasksToResolveInline,
  });

  // Return a clear status payload back to the stream user right away!
  return {
    success: true,
    memoryId,
    // tags: extractedLabels,
    originalLength: content.length,
    compressedLength: compressedContent.length,
    taskCount: tasksToInsert.length,
    message: "Memory processed successfully and queued for disk sync buffer allocation.",
  };
});
