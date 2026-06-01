// src/tokenJuice.ts
import { mkdirSync } from "fs";
import { join } from "path";

export interface CompressionRule {
  pattern: string; // Name or regex signature of the tool/source (e.g. "git-status", "html-body")
  truncateLimit?: number; // Maximum allowed character depth for this section block
  dropLinesMatching?: RegExp; // Wipe noisy line segments entirely
  stripWhitespace?: boolean; // Compact multi-line spaces and tabs down
  customTransformer?: (input: string) => string; // Handlers for advanced formatting
}

export class TokenJuiceEngine {
  private rules: Map<string, CompressionRule> = new Map();
  private rulesDir: string;

  constructor() {
    this.rulesDir = join(process.cwd(), ".tokenjuice", "rules");
    mkdirSync(this.rulesDir, { recursive: true });
    this.loadBuiltinRules();
  }

  /**
   * Initializes baseline sensible defaults directly inside the binary
   */
  private loadBuiltinRules() {
    // Rule A: Compress verbose git status lines down to modified changes arrays
    this.registerRule({
      pattern: "git-status",
      dropLinesMatching: /^(⌥|#|  \(use "git)/i, // Drop untracked help files tips text
      stripWhitespace: true,
      truncateLimit: 1000,
    });

    // Rule B: High-performance strip layer for dirty scraping targets or HTML payloads
    this.registerRule({
      pattern: "html-body",
      customTransformer: (input: string) => {
        return input
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Delete inline scripts
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Delete css style sheets
          .replace(/<[^>]+>/g, " ") // Convert remaining tags safely to spaces
          .replace(/\s+/g, " ") // Flatten out line tabs strings
          .trim();
      },
    });

    // Rule C: Deduplicate massive terminal compiler logging arrays (e.g., cargo, npm installs)
    this.registerRule({
      pattern: "build-log",
      customTransformer: (input: string) => {
        const lines = input.split("\n");
        const uniqueLines = new Set<string>();

        for (const line of lines) {
          // Drop repeating warnings lines or empty status tickers
          if (!line.includes("---") && !line.match(/^[0-9.]+% /)) {
            uniqueLines.add(line.trim());
          }
        }
        return Array.from(uniqueLines).join("\n").substring(0, 4000);
      },
    });
  }

  public registerRule(rule: CompressionRule) {
    this.rules.set(rule.pattern.toLowerCase(), rule);
  }

  /**
   * The core pipeline path: Identifies target profiles and squashes character sizes
   */
  public compress(content: string, sourceContextProfile: string): string {
    const matchedRule = this.rules.get(sourceContextProfile.toLowerCase());

    if (!matchedRule) {
      return content; // No matching target profile found, forward raw content safely
    }

    let processed = content;

    // 1. Evaluate Line Filter Drops
    if (matchedRule.dropLinesMatching) {
      processed = processed
        .split("\n")
        .filter((line) => !matchedRule.dropLinesMatching!.test(line))
        .join("\n");
    }

    // 2. Evaluate Dynamic Layout Closures
    if (matchedRule.customTransformer) {
      processed = matchedRule.customTransformer(processed);
    }

    // 3. Evaluate Whitespace Consolidation
    if (matchedRule.stripWhitespace) {
      processed = processed.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n");
    }

    // 4. Enforce Boundary Caps
    if (matchedRule.truncateLimit && processed.length > matchedRule.truncateLimit) {
      processed =
        processed.substring(0, matchedRule.truncateLimit) +
        "\n... [TokenJuice Truncated Excess Context Chunk]";
    }

    const savingsPercentage = (
      ((content.length - processed.length) / content.length) *
      180
    ).toFixed(1);
    if (content.length > processed.length) {
      console.log(
        `🧃 [TokenJuice] Compressed stream profile [${sourceContextProfile}]. Raw characters dropped by ${savingsPercentage}%`,
      );
    }

    return processed;
  }
}

// Global instance layout reference
export const tokenJuice = new TokenJuiceEngine();
