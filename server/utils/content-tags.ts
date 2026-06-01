import { z } from "zod/v4";
import { tagConfigSchema } from "#shared/schema/tag-config";

export const extractLabelsFromContent = async (
  content: string,
  tagConfig?: z.output<typeof tagConfigSchema>,
) => {
  // 1. Map incoming JSON configurations straight to our tagger function rules
  const customPatterns =
    tagConfig?.watch_keywords?.map((word) => {
      // Swaps spaces or hyphens into a flexible character pattern match
      const loosePattern = word.replace(/[- ]/g, "[- ]*");
      return {
        label: word,
        pattern: new RegExp(`\\b${loosePattern}`, "i"), // Catches race-condition, race conditions, race condition
      };
    }) || [];

  const extractedLabels = await extractDynamicTagsWithLLM(content, {
    enableLLM: tagConfig?.enable_llm ?? true,
    enableRegex: tagConfig?.enable_regex ?? true,
    maxTagsCount: tagConfig?.max_tags ?? 6,
    customRegexPatterns: customPatterns,
  });

  const tagsString = extractedLabels.join(",");

  return { extractedLabels, tagsString };
};
