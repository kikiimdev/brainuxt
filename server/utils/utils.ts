import { nanoid } from "nanoid";

export const generateId = (prefix?: string) => (prefix ? `${prefix}_${nanoid(12)}` : nanoid(12));

/**
 * Generates a uniform, file-system safe, exact name for wiki files.
 * Example output: "20260531_195518_L1_mem_ZxxBOLMzprcU.md"
 */
export function getStandardWikiFileName(node: {
  id: string;
  level: number;
  created_at: string;
}): string {
  // Extract a clean timestamp footprint (YYYYMMDD_HHMMSS)
  const cleanTimestamp = node.created_at
    .replace(/[- :]/g, "") // Strip symbols
    .replace("T", "_") // Handle ISO characters safely
    .split(".")[0]; // Remove milliseconds

  // Use the FULL node ID to guarantee absolute link uniqueness
  return `${cleanTimestamp}_L${node.level}_${node.id}.md`;
}
