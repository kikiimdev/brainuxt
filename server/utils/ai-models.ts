// src/models.ts
import { env, pipeline } from "@huggingface/transformers";
import { join } from "path";
import { generateText, Output } from "ai";
import { z } from "zod/v4";

export interface TaggerConfig {
  enableLLM?: boolean;
  enableRegex?: boolean;
  maxTagsCount?: number;
  customRegexPatterns?: { label: string; pattern: RegExp }[];
}

// Dynamically target the executable's directory
const projectRoot = process.env.MEMORY_LAYER_DIR || process.cwd();
const cacheDir = join(projectRoot, ".cache", "brainuxt", "models");

env.cacheDir = cacheDir;
env.allowRemoteModels = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.simd = true;

let embedderPipeline: any = null;
let classifierPipeline: any = null; // 👈 Placeholder for our tagger

export async function getEmbedder(modelName = "Xenova/all-MiniLM-L6-v2") {
  if (!embedderPipeline) {
    embedderPipeline = await pipeline("feature-extraction", modelName, { dtype: "fp32" });
  }
  return embedderPipeline;
}

/**
 * Initializes the lightweight local Zero-Shot Classification pipeline
 */
export async function getClassifier(modelName = "Xenova/distilbert-base-uncased-mnli") {
  if (!classifierPipeline) {
    classifierPipeline = await pipeline("zero-shot-classification", modelName, { dtype: "fp32" });
  }
  return classifierPipeline;
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Float32Array.from(output.data);
}

/**
 * Evaluates text against candidate tags locally and returns tags exceeding a threshold
 */
export async function extractTags(
  text: string,
  tags: string[],
  confidenceThreshold = 0.5,
): Promise<string[]> {
  try {
    const classifier = await getClassifier();

    // Execute inference locally via WASM using multiLabel strategy
    const result = await classifier(text, tags, { multi_label: true });

    // Filter out tags that score below our certainty threshold
    const matchingTags: string[] = [];
    for (let i = 0; i < result.labels.length; i++) {
      if (result.scores[i] >= confidenceThreshold) {
        matchingTags.push(result.labels[i]);
      }
    }
    return matchingTags;
  } catch (error) {
    console.error("❌ Metadata tagging error:", error);
    return []; // Fail gracefully, return empty array if model hiccups
  }
}

/**
 * Leverages MiMo 2.5's Structured Outputs to analyze a log entry
 * and generate contextual dynamic tags on the fly.
 */
export async function extractDynamicTagsWithLLM(
  content: string,
  config: TaggerConfig = {},
): Promise<string[]> {
  // Establish baseline structural parameters with smart defaults
  const {
    enableLLM = true,
    enableRegex = true,
    maxTagsCount = 5,
    customRegexPatterns = [],
  } = config;

  const tagResultsSet = new Set<string>();

  // LAYER A: Process Advanced AI Model Classifications
  if (enableLLM) {
    try {
      const provider = useAiProvider(DEFAULT_AI_PROVIDER);
      const { output } = await generateText({
        model: provider("mimo-v2-flash"),
        temperature: 0.2,
        system: {
          role: "system",
          content:
            "You are an automated metadata classifier. Extract 1 to 3 highly precise, single-word or hyphenated categories (e.g., 'devops', 'ui-design') that best describe the log. Output ONLY a valid JSON object matching the requested schema.",
        },
        prompt: `Extract tags for:\n"${content}"`,
        output: Output.object({
          name: "tagExtraction",
          description: `Extract dynamic tags from {content}`,
          schema: z.object({
            tags: z.array(z.string()),
          }),
        }),
      });

      if (output?.tags?.length) {
        output.tags.forEach((t) => tagResultsSet.add(t.toLowerCase().trim()));
      }
    } catch (_error) {
      const error = _error as {
        statusCode?: number;
        message?: string;
        status?: number;
      };
      if (
        error.statusCode === 429 ||
        error.message?.includes("Too many requests") ||
        error.status === 429
      ) {
        console.warn(
          "⚠️ [Ingest Gateway] Upstream rate limit hit during tag extraction. Engaging local heuristic fallback router.",
        );
      } else {
        console.error(
          "❌ [Ingest Gateway] Unhandled error during tagging engine pass. Falling back to rules:",
          error.message,
        );
      }
    }
  }

  // LAYER B: Process Native Structural Token Extractor Rules
  if (enableRegex) {
    // 1. Core structural patterns: Project keys (SALAM-RINDU) and @handles (@Alice)
    const baselineRules = [/[A-Z]{3,}-[A-Z]{3,}/g, /@([a-zA-Z0-9_]+)/g];

    for (const rule of baselineRules) {
      const matches = content.match(rule) || [];
      matches.forEach((match) => {
        const cleanToken = match.toLowerCase().replace("@", "").trim();
        if (cleanToken) tagResultsSet.add(cleanToken);
      });
    }

    // 2. Evaluate dynamically supplied downstream pattern configs
    for (const entry of customRegexPatterns) {
      if (entry.pattern.test(content)) {
        tagResultsSet.add(entry.label.toLowerCase().trim());
      }
    }
  }

  // Convert unified matrix back into bounded, array-safe payloads
  return Array.from(tagResultsSet).filter(Boolean).slice(0, maxTagsCount);
}
