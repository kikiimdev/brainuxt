import { z } from "zod/v4";

export const tagConfigSchema = z.object({
  enable_llm: z.boolean().optional().default(true),
  enable_regex: z.boolean().optional().default(true),
  max_tags: z.number().optional().default(6),
  watch_keywords: z.array(z.string()).optional(),
});
