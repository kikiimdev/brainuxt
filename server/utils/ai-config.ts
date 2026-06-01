import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createError } from "evlog";

const PROVIDERS = ["OPENAI_COMPATIBLE"] as const;

export const DEFAULT_AI_PROVIDER: AiProviderOptions = {
  provider: "OPENAI_COMPATIBLE",
  providerName: "xiaomi",
  apiKey: process.env.MIMO_API_KEY!,
  baseUrl: "https://api.xiaomimimo.com/v1",
};

type AiProviderOptions = {
  provider: (typeof PROVIDERS)[number];
  apiKey: string;
  providerName?: string; // if using OPENAI_COMPATIBLE
  baseUrl?: string; // if using OPENAI_COMPATIBLE
};

export const useAiProvider = (opts: AiProviderOptions) => {
  if (opts.provider === "OPENAI_COMPATIBLE") {
    return createOpenAICompatible({
      name: opts.providerName!,
      apiKey: opts.apiKey,
      baseURL: opts.baseUrl!,
      includeUsage: true, // Include usage information in streaming responses
    });
  }

  throw createError({
    status: 500,
    message: `Unsupported AI provider: ${opts.provider}`,
    why: `Supported providers: ${PROVIDERS.join(", ")}`,
    fix: "Please use one of the following providers: " + PROVIDERS.join(", "),
  });
};
