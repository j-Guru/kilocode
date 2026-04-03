# feat: Vertex AI MaaS Model Support

## Overview

Adds support for **Google Cloud Vertex AI Model-as-a-Service (MaaS)** — third-party models
(Meta, DeepSeek, Qwen, MiniMax, etc.) served through Google Cloud's Vertex AI platform via
an OpenAI-compatible Chat Completions API.

MaaS models are injected into the existing `google-vertex` provider at startup, so no new
provider configuration is required from the user.

---

## Files Changed

### `packages/opencode/src/kilocode/vertex-maas.ts` _(new file)_

Defines all Vertex AI MaaS models and a `maasModel()` factory function.

**Key design decisions:**

- Reuses the existing `google-vertex` provider — models are registered under its ID, so
  authentication (OAuth2 Application Default Credentials) and URL template substitution
  (`${GOOGLE_VERTEX_PROJECT}`, `${GOOGLE_VERTEX_LOCATION}`, `${GOOGLE_VERTEX_ENDPOINT}`)
  are handled for free by the already-existing custom loader in `provider.ts`.
- Uses the OpenAI-compatible endpoint exposed by Vertex AI:
  ```
  https://{location}-aiplatform.googleapis.com/v1beta1/projects/{project}/locations/{location}/endpoints/openapi
  ```
- The `api.id` field uses the `{publisher}/{modelId}` format required by the MaaS API
  (this becomes the `model` field in the OpenAI-compatible request body).
- Uses `@ai-sdk/openai-compatible` as the NPM SDK.

**Models added:**

| Model                          | Publisher   | Context   | Output  | Notes                                 |
| ------------------------------ | ----------- | --------- | ------- | ------------------------------------- |
| Llama 4 Maverick 17B           | meta        | 1,310,720 | 8,192   |                                       |
| Llama 4 Scout 17B              | meta        | 1,310,720 | 8,192   |                                       |
| GPT OSS 120B                   | openai      | 131,072   | 32,768  |                                       |
| Qwen3 Coder 480B A35B Instruct | qwen        | 262,144   | 32,768  |                                       |
| Kimi K2 Thinking               | moonshotai  | 262,144   | 16,384  | reasoning (`reasoning_content` field) |
| MiniMax M2                     | minimaxai   | 192,000   | 16,384  |                                       |
| DeepSeek V3.2                  | deepseek-ai | 163,840   | 32,768  |                                       |
| DeepSeek R1 0528               | deepseek-ai | 163,840   | 32,768  | reasoning (`reasoning_content` field) |
| GLM-5                          | zai-org     | 200,000   | 128,000 | image input, prompt caching           |

---

### `packages/opencode/src/provider/provider.ts`

Two changes:

#### 1. OAuth2 token scope fix (affects all Vertex AI models)

The existing token fetch used `getApplicationDefault()` without explicit scopes. In some
environments this returns an ID token or a token with no scope, causing `invalid_scope`
errors from the MaaS endpoint.

**Before:**

```ts
const auth = new GoogleAuth()
const client = await auth.getApplicationDefault()
const token = await client.credential.getAccessToken()
```

**After:**

```ts
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] })
const client = await auth.getClient()
const token = await client.getAccessToken()
```

Using `getClient()` with the explicit `cloud-platform` scope ensures a properly-scoped
OAuth2 access token is always returned. This fix benefits all Vertex AI models, not just
MaaS ones.

#### 2. MaaS model injection at startup

At startup, all `VERTEX_MAAS_MODELS` are injected into the `google-vertex` provider's
model database:

```ts
if (database["google-vertex"]) {
  for (const model of VERTEX_MAAS_MODELS) {
    database["google-vertex"].models[model.id] = model
  }
}
```

This makes MaaS models available alongside native Vertex AI models with no extra
provider setup required from the user.

---

## How It Works End-to-End

1. User selects a MaaS model (e.g. `deepseek-r1-0528-maas`) from the `google-vertex` provider.
2. The existing `google-vertex` custom loader substitutes the URL template variables using
   the user's configured GCP project, location, and endpoint.
3. The loader fetches an OAuth2 access token with the `cloud-platform` scope via
   Application Default Credentials and injects it as a `Bearer` token header.
4. The `@ai-sdk/openai-compatible` SDK calls the Vertex AI OpenAI-compatible endpoint,
   with the `model` field set to `{publisher}/{modelId}` (e.g. `deepseek-ai/deepseek-r1-0528-maas`).
5. For reasoning models, interleaved reasoning content is read from the `reasoning_content`
   field in the response.
