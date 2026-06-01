// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  vite: {
    optimizeDeps: {
      include: ["@vue/devtools-core", "@vue/devtools-kit"],
    },

    build: {
      rolldownOptions: {
        checks: {
          invalidAnnotation: false,
        },
      },
    },
  },

  imports: {
    dirs: ["shared/utils/schema"],
  },
  nitro: {
    preset: "bun",
    imports: {
      dirs: ["shared/utils/schema"],
    },
    externals: {
      external: ["sharp", "sqlite-vec", "onnxruntime-node", "@huggingface/transformers"],
    },
    tasks: {
      "memories:synthesize-l1": {
        handler: "./server/tasks/memories/synthesize-l1.ts",
        description: "Condenses raw L0 logs into L1 summaries every 20 minutes",
      },
      "memories:synthesize-l2": {
        handler: "./server/tasks/memories/synthesize-l2.ts",
        description: "Consolidates L1 summaries into L2 Macro Chapters every 12 hours",
      },
    },
    // Native Nitro Cron engine configuration scheduling options
    scheduledTasks: {
      "*/20 * * * *": ["memories:synthesize-l1"], // Every 20 minutes
      "0 */12 * * *": ["memories:synthesize-l2"], // Every 12 hours
    },
  },

  css: ["~/assets/css/main.css"],
  modules: ["nuxt-bun-compile", "@nuxt/image", "@nuxt/ui", "@vueuse/nuxt", "evlog/nuxt"],

  image: false, // Disable Nuxt Image module's default optimizations

  evlog: {
    env: {
      service: "default-service",
    },
    routes: {
      "/api/auth/**": { service: "auth-service" },
      "/api/model/**": { service: "zenstack-service" },
    },
    include: ["/api/**"],
    exclude: [
      "/__nuxt_hydration",
      "/api/_nuxt_icon/**",
      "/api/_content/**",
      "/api/health",
      "/api/auth/me",
    ],
    transport: {
      enabled: true,
      endpoint: "/api/_evlog/ingest",
    },
  },

  bunCompile: {
    outfile: "brainuxt",
    extraExternals: ["sqlite-vec", "onnxruntime-node", "@huggingface/transformers"],
  },

  $development: {
    bunCompile: {
      target: "bun-darwin-arm64",
    },
  },

  $production: {
    evlog: {
      sampling: {
        rates: { info: 10 }, // Only 10% of info logs
        keep: [
          { duration: 1000 }, // Always keep if duration >= 1000ms
          { status: 400 }, // Always keep if status >= 400
          { path: "/api/critical/**" }, // Always keep critical paths
        ],
      },
    },

    bunCompile: {
      target: "bun-linux-x64-musl",
    },
  },
});
