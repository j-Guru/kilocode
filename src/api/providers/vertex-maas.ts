// kilocode_change - new file
import type { Anthropic } from "@anthropic-ai/sdk"
import { GoogleAuth, type AuthClient, type JWTInput } from "google-auth-library"

import { type ModelInfo, type VertexModelId, vertexDefaultModelId, vertexModels } from "@roo-code/types"

import { type ApiHandlerOptions, getModelMaxOutputTokens } from "../../shared/api"
import { calculateApiCostOpenAI } from "../../shared/cost"
import { safeJsonParse } from "../../shared/safeJsonParse"
import { XmlMatcher } from "../../utils/xml-matcher"
import { convertToOpenAiMessages } from "../transform/openai-format"
import type { ApiStream } from "../transform/stream"

import type { ApiHandlerCreateMessageMetadata, SingleCompletionHandler } from "../index"
import { BaseProvider } from "./base-provider"
import { DEFAULT_HEADERS } from "./constants"
import { getApiRequestTimeout } from "./utils/timeout-config"

const VERTEX_AUTH_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

export class VertexMaaSHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private authClientPromise: Promise<AuthClient>

	constructor(options: ApiHandlerOptions) {
		super()

		this.options = options

		if (!this.options.vertexProjectId || !this.options.vertexRegion) {
			throw new Error("vertexProjectId and vertexRegion are required for Vertex MaaS models")
		}

		this.authClientPromise = this.createAuthClient()
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const model = this.getModel()
		const accessToken = await this.getAccessToken()
		const url = this.buildApiUrl()

		const isMistral = model.info.vertexPublisher === "mistralai"
		if (isMistral) {
			// Mistral models on Vertex use a different API endpoint (:rawPredict) and a native payload.
			// The streaming response format may also differ from the standard SSE.
			// This block can be implemented when Mistral models are re-enabled and tested.
			throw new Error("Mistral models on Vertex AI are not yet supported in this handler.")
		}

		// For all other MaaS models, use the OpenAI-compatible Chat Completions API.
		// We explicitly exclude stream_options as it's a common cause of 400 on some Vertex endpoints.
		const fullModelId = `${model.info.vertexPublisher}/${model.id}`
		const requestBody: any = {
			model: fullModelId,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			temperature: this.options.modelTemperature ?? 0,
			stream: true,
		}

		const max_tokens =
			getModelMaxOutputTokens({
				modelId: model.id,
				model: model.info,
				settings: this.options,
				format: "openai",
			}) ?? undefined

		if (max_tokens) {
			requestBody.max_tokens = max_tokens
		}

		if (metadata?.tools && metadata.tools.length > 0) {
			requestBody.tools = this.convertToolsForOpenAI(metadata.tools)
			if (metadata.tool_choice) {
				requestBody.tool_choice = metadata.tool_choice
			}
		}

		const timeout = getApiRequestTimeout()
		const controller = new AbortController()
		const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					...DEFAULT_HEADERS,
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			})

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "")
				throw new Error(
					`Vertex AI MaaS error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
				)
			}

			if (!response.body) {
				throw new Error("Vertex AI MaaS error: Response body is null")
			}

			const matcher = new XmlMatcher(
				"think",
				(chunk) =>
					({
						type: chunk.matched ? ("reasoning" as const) : ("text" as const),
						text: chunk.data,
					}) as const,
			)

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ""
			let lastUsage: any = null

			try {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split("\n")
					buffer = lines.pop() || ""

					for (const line of lines) {
						if (!line.trim().startsWith("data: ")) continue

						const data = line.slice(6)
						if (data.trim() === "[DONE]") continue

						try {
							const json = JSON.parse(data)
							const delta = json.choices?.[0]?.delta

							if (delta?.content) {
								for (const chunk of matcher.update(delta.content)) {
									yield chunk
								}
							}

							const reasoningContent = delta?.reasoning_content || delta?.reasoning
							if (reasoningContent) {
								yield { type: "reasoning", text: reasoningContent }
							}

							if (delta?.tool_calls) {
								for (const toolCall of delta.tool_calls) {
									yield {
										type: "tool_call_partial",
										index: toolCall.index,
										id: toolCall.id,
										name: toolCall.function?.name,
										arguments: toolCall.function?.arguments,
									}
								}
							}

							if (json.usage) {
								lastUsage = json.usage
							}
						} catch (e) {
							// Ignore JSON parse errors for incomplete stream lines
						}
					}
				}

				for (const chunk of matcher.final()) {
					yield chunk
				}

				if (lastUsage) {
					const inputTokens = lastUsage.prompt_tokens || 0
					const outputTokens = lastUsage.completion_tokens || 0
					const { totalCost } = calculateApiCostOpenAI(model.info, inputTokens, outputTokens)

					yield { type: "usage", inputTokens, outputTokens, totalCost }
				}
			} finally {
				reader.releaseLock()
			}
		} finally {
			if (timeoutId) clearTimeout(timeoutId)
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const model = this.getModel()
		const accessToken = await this.getAccessToken()
		const url = this.buildApiUrl()

		const timeout = getApiRequestTimeout()
		const controller = new AbortController()
		const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					...DEFAULT_HEADERS,
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: `${model.info.vertexPublisher}/${model.id}`,
					messages: [{ role: "user", content: prompt }],
					temperature: 0,
					stream: false,
				}),
				signal: controller.signal,
			})

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "")
				throw new Error(
					`Vertex AI MaaS error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
				)
			}

			const json = await response.json()
			return json.choices?.[0]?.message?.content || ""
		} finally {
			if (timeoutId) clearTimeout(timeoutId)
		}
	}

	override getModel() {
		const modelId = this.options.apiModelId
		const id = modelId && modelId in vertexModels ? (modelId as VertexModelId) : vertexDefaultModelId
		const info: ModelInfo = vertexModels[id]
		return { id, info }
	}

	private async getAccessToken(): Promise<string> {
		const client = await this.authClientPromise
		const result = await client.getAccessToken()
		if (!result?.token) {
			throw new Error("Could not get a Vertex AI access token. Check your Google credentials.")
		}
		return result.token
	}

	private createAuthClient(): Promise<AuthClient> {
		const authOptions: ConstructorParameters<typeof GoogleAuth>[0] = {
			scopes: VERTEX_AUTH_SCOPES,
		}

		if (this.options.vertexJsonCredentials) {
			const credentials = safeJsonParse<JWTInput>(this.options.vertexJsonCredentials, undefined)
			if (credentials?.private_key) {
				credentials.private_key = credentials.private_key.replace(/\\n/g, "\n")
			}
			authOptions.credentials = credentials
		} else if (this.options.vertexKeyFile) {
			authOptions.keyFile = this.options.vertexKeyFile.replace(/\\/g, "/")
		}

		// If neither is provided, GoogleAuth will attempt to use Application Default Credentials.
		return new GoogleAuth(authOptions).getClient()
	}

	private buildApiUrl(): string {
		const { vertexProjectId: projectId, vertexRegion: region, apiModelId: modelId } = this.options
		const model = this.getModel()
		const host = region === "global" ? "aiplatform.googleapis.com" : `${region}-aiplatform.googleapis.com`

		if (model.info.vertexPublisher === "mistralai") {
			return `https://${host}/v1/projects/${projectId}/locations/${region}/publishers/mistralai/models/${modelId}:rawPredict`
		}

		return `https://${host}/v1/projects/${projectId}/locations/${region}/endpoints/openapi/chat/completions`
	}
}
