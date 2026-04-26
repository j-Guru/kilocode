// kilocode_change - new file
import type { Model } from "../provider/provider"
import { ModelID, ProviderID } from "../provider/schema"

/**
 * Vertex AI Model-as-a-Service (MaaS) model definitions.
 *
 * MaaS models are third-party models (Meta, MiniMax, DeepSeek, etc.) that are
 * served through Google Cloud's Vertex AI platform using an OpenAI-compatible
 * Chat Completions API.
 *
 * Authentication uses Google Application Default Credentials (OAuth2), which is
 * handled automatically by the existing `google-vertex` custom loader in provider.ts.
 *
 * The base URL uses template variables that are substituted by `loadBaseURL` in
 * provider.ts via `googleVertexVars(options)`:
 *   ${GOOGLE_VERTEX_ENDPOINT}  → e.g. "us-central1-aiplatform.googleapis.com"
 *   ${GOOGLE_VERTEX_PROJECT}   → GCP project ID
 *   ${GOOGLE_VERTEX_LOCATION}  → GCP region, e.g. "us-central1"
 *
 * The OpenAI-compatible SDK appends /chat/completions to produce the full endpoint:
 *   https://{location}-aiplatform.googleapis.com/v1beta1/projects/{project}/locations/{location}/endpoints/openapi/chat/completions
 *
 * The `api.id` uses the `{publisher}/{modelId}` format required by the MaaS API
 * (matches the `model` field in the OpenAI-compatible request body).
 */

const MAAS_BASE_URL =
  "https://${GOOGLE_VERTEX_ENDPOINT}/v1beta1/projects/${GOOGLE_VERTEX_PROJECT}/locations/${GOOGLE_VERTEX_LOCATION}/endpoints/openapi"

const MAAS_NPM = "@ai-sdk/openai-compatible"

type MaaSModelOptions = {
  reasoning?: boolean
  image?: boolean
  toolcall?: boolean
}

function maasModel(
  id: string,
  publisher: string,
  name: string,
  cost: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
  limit: { context: number; output: number },
  opts: MaaSModelOptions = {},
): Model {
  return {
    id: ModelID.make(id),
    providerID: ProviderID.googleVertex,
    api: {
      id: `${publisher}/${id}`,
      url: MAAS_BASE_URL,
      npm: MAAS_NPM,
    },
    name,
    family: undefined,
    capabilities: {
      temperature: true,
      reasoning: opts.reasoning ?? false,
      attachment: opts.image ?? false,
      toolcall: opts.toolcall ?? true,
      input: {
        text: true,
        audio: false,
        image: opts.image ?? false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: opts.reasoning ? { field: "reasoning_content" as const } : false,
    },
    cost: {
      input: cost.input,
      output: cost.output,
      cache: {
        read: cost.cacheRead ?? 0,
        write: cost.cacheWrite ?? 0,
      },
    },
    limit,
    status: "active",
    options: {},
    headers: {},
    release_date: "2025-01-01",
    variants: {},
  }
}

/**
 * All Vertex AI MaaS models supported by Kilocode.
 *
 * These are injected into the `google-vertex` provider database at startup
 * (see provider.ts kilocode_change injection block).
 *
 * The existing `google-vertex` CUSTOM_LOADER handles:
 *  - OAuth2 token injection via Application Default Credentials
 *  - URL template substitution for project/location/endpoint
 *  - `includeUsage: true` for OpenAI-compatible models
 */
export const VERTEX_MAAS_MODELS: Model[] = [
  // ── Meta ──────────────────────────────────────────────────────────────────
  maasModel(
    "llama-4-maverick-17b-128e-instruct-maas",
    "meta",
    "Llama 4 Maverick 17B (Vertex MaaS)",
    { input: 0.35, output: 1.15 },
    { context: 1_310_720, output: 8_192 },
    { toolcall: true },
  ),
  maasModel(
    "llama-4-scout-17b-16e-instruct-maas",
    "meta",
    "Llama 4 Scout 17B (Vertex MaaS)",
    { input: 0.25, output: 0.7 },
    { context: 1_310_720, output: 8_192 },
    { toolcall: true },
  ),

  // ── OpenAI ────────────────────────────────────────────────────────────────
  maasModel(
    "gpt-oss-120b-maas",
    "openai",
    "GPT OSS 120B (Vertex MaaS)",
    { input: 0.15, output: 0.6 },
    { context: 131_072, output: 32_768 },
    { toolcall: true },
  ),

  // ── Qwen ──────────────────────────────────────────────────────────────────
  maasModel(
    "qwen3-coder-480b-a35b-instruct-maas",
    "qwen",
    "Qwen3 Coder 480B A35B Instruct (Vertex MaaS)",
    { input: 1.0, output: 4.0 },
    { context: 262_144, output: 32_768 },
    { toolcall: true },
  ),

  // ── Moonshot AI ───────────────────────────────────────────────────────────
  maasModel(
    "kimi-k2-thinking-maas",
    "moonshotai",
    "Kimi K2 Thinking (Vertex MaaS)",
    { input: 0.6, output: 2.5 },
    { context: 262_144, output: 16_384 },
    { toolcall: true, reasoning: true },
  ),

  // ── MiniMax ───────────────────────────────────────────────────────────────
  maasModel(
    "minimax-m2-maas",
    "minimaxai",
    "MiniMax M2 (Vertex MaaS)",
    { input: 0.3, output: 1.2 },
    { context: 192_000, output: 16_384 },
    { toolcall: true },
  ),

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  maasModel(
    "deepseek-v3.2-maas",
    "deepseek-ai",
    "DeepSeek V3.2 (Vertex MaaS)",
    { input: 0.6, output: 1.7 },
    { context: 163_840, output: 32_768 },
    { toolcall: true },
  ),
  maasModel(
    "deepseek-r1-0528-maas",
    "deepseek-ai",
    "DeepSeek R1 0528 (Vertex MaaS)",
    { input: 1.35, output: 5.4 },
    { context: 163_840, output: 32_768 },
    { toolcall: true, reasoning: true },
  ),

  // ── Z.ai (GLM) ────────────────────────────────────────────────────────────
  maasModel(
    "glm-5-maas",
    "zai-org",
    "GLM-5 (Vertex MaaS)",
    { input: 1.0, output: 3.2, cacheRead: 0.1, cacheWrite: 0.1 },
    { context: 200_000, output: 128_000 },
    { toolcall: true, image: true },
  ),
]
