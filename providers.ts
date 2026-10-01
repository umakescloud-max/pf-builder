// OpenAI-compatible provider registry for builder adapters.
// Registration only — dispatch/QuotaError logic is Phase 3's llm.ts (HANDOFF.md §5.5).
// Phase 2 spike arms do not route through nvidia or openrouter; groq is listed for reference.
export const openAICompatProviders = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", apiKeyEnv: "NVIDIA_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
} as const;
