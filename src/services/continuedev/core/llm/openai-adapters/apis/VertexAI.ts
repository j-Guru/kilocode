import { streamSse } from "../../../fetch/stream.js"
import { logError, logInfo, logDebug } from "../../../services/telemetry/logging"
import { AuthClient, GoogleAuth, JWT, auth } from "google-auth-library"
import {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateParams,
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionCreateParamsStreaming,
	Completion,
	CompletionCreateParamsNonStreaming,
	CompletionCreateParamsStreaming,
	Model,
} from "openai/resources/index"
import { VertexAIConfig } from "../types.js"
import { chatChunk, chatCompletion } from "../util.js"
import { AnthropicApi } from "./Anthropic.js"
import { BaseLlmApi, CreateRerankResponse, FimCreateParamsStreaming } from "./base.js"
import { GeminiApi } from "./Gemini.js"
import { OpenAIApi } from "./OpenAI.js"

export class VertexAIApi implements BaseLlmApi {
	anthropicInstance: AnthropicApi
	geminiInstance: GeminiApi
	mistralInstance: OpenAIApi
	private clientPromise?: Promise<AuthClient | void>
	static AUTH_SCOPES = "https://www.googleapis.com/auth/cloud-platform"

	constructor(protected config: VertexAIConfig) {
		this.setupAuthentication()

		// These sub-instances are only used to convert and handle responses,
		// So do not need apiKey, etc
		this.anthropicInstance = new AnthropicApi({
			provider: "anthropic",
			apiKey: "dud",
		})
		this.geminiInstance = new GeminiApi({
			provider: "gemini",
			apiKey: "dud",
		})
		this.mistralInstance = new OpenAIApi({
			provider: "mistral",
			apiKey: "dud",
		})
	}

	private setupAuthentication(): void {
		const { apiKey, env } = this.config
		const { region, projectId, keyFile, keyJson } = env || {}

		// Validate authentication configuration
		if (apiKey) {
			// Express mode validation
			if (region || projectId || keyFile || keyJson) {
				throw new Error(
					"VertexAI in express mode (apiKey only) cannot be configured with region, projectId, keyFile, or keyJson",
				)
			}
		} else {
			// Standard mode validation
			if (!region || !projectId) {
				throw new Error("region and projectId are required for VertexAI (when not using express/apiKey mode)")
			}
			if (keyFile && keyJson) {
				throw new Error("VertexAI credentials can be configured with either keyFile or keyJson but not both")
			}
		}

		// Set up authentication client
		if (keyJson) {
			try {
				const parsed = JSON.parse(keyJson)
				if (!parsed?.private_key) {
					throw new Error("VertexAI: keyJson must contain a valid private key")
				}
				parsed.private_key = parsed.private_key.replace(/\\n/g, "\n")
				const jsonClient = auth.fromJSON(parsed)
				if (jsonClient instanceof JWT) {
					jsonClient.scopes = [VertexAIApi.AUTH_SCOPES]
				} else {
					throw new Error("VertexAI: keyJson must be a valid JWT")
				}
				this.clientPromise = Promise.resolve(jsonClient)
			} catch {
				throw new Error("VertexAI: Failed to parse keyJson")
			}
		} else if (keyFile) {
			if (typeof keyFile !== "string") {
				throw new Error("VertexAI: keyFile must be a string")
			}
			this.clientPromise = new GoogleAuth({
				scopes: VertexAIApi.AUTH_SCOPES,
				keyFile: keyFile?.replace(/\\/g, "/"),
			})
				.getClient()
				.catch((e: Error) => {
					throw new Error(`VertexAI authentication failed: ${e.message}`)
				})
		} else if (!apiKey) {
			// Application Default Credentials
			this.clientPromise = new GoogleAuth({
				scopes: VertexAIApi.AUTH_SCOPES,
			})
				.getClient()
				.catch((e: Error) => {
					throw new Error(`VertexAI authentication failed: ${e.message}`)
				})
		}
	}

	private getApiBase(provider?: string): string {
		logDebug("VertexAI.getApiBase", { provider, apiKey: !!this.config.apiKey, env: this.config.env })
		const { apiKey, env } = this.config

		if (this.config.apiBase) {
			return this.config.apiBase
		}

		if (apiKey) {
			// Express mode
			return "https://aiplatform.googleapis.com/v1/"
		} else {
			// Standard mode
			let { region, projectId } = env!

			// kilocode_change start
			// Handle region normalization for different provider types
			if (region === "global") {
				// For MaaS providers (non-Google), force us-central1 as global is not typically supported
				if (provider && provider !== "gemini" && provider !== "anthropic") {
					console.warn(`[VertexAI] MaaS provider ${provider} switching from global to us-central1 region`)
					region = "us-central1"
				}
				// For Google providers in global region, use the global endpoint format
				return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/`
			}
			// kilocode_change end

			// Standard regional endpoint format
			return `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/`
		}
	}

	private determineVertexProvider(
		model: string,
	): "mistral" | "anthropic" | "gemini" | "qwen" | "llama" | "deepseek" | "kimi" | "minimax" | "unknown" {
		// kilocode_change
		if (model.includes("mistral") || model.includes("codestral") || model.includes("mixtral")) {
			return "mistral"
		} else if (model.includes("claude")) {
			return "anthropic"
		} else if (model.includes("gemini")) {
			return "gemini"
			// kilocode_change start
		} else if (model.includes("qwen")) {
			return "qwen"
		} else if (model.includes("llama")) {
			return "llama"
		} else if (model.includes("deepseek")) {
			return "deepseek"
		} else if (model.includes("kimi")) {
			return "kimi"
		} else if (model.includes("minimax")) {
			return "minimax"
		}
		// kilocode_change end
		return "unknown"
	}

	private async getAuthHeaders(): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			// Accept: "application/json"
		}

		// TODO - support anthropic prompt caching with "anthropic-beta" header

		if (this.config.apiKey) {
			// Express mode - no Authorization header needed, API key is in URL
			return headers
		} else {
			// Standard mode - use OAuth token
			const client = await this.clientPromise
			const result = await client?.getAccessToken()
			if (!result?.token) {
				throw new Error("Could not get an access token. Set up your Google Application Default Credentials.")
			}
			headers.Authorization = `Bearer ${result.token}`
			return headers
		}
	}

	private buildUrl(endpoint: string, provider?: string): URL {
		const apiBase = this.getApiBase(provider)
		const url = new URL(endpoint, apiBase)

		if (this.config.apiKey) {
			url.searchParams.set("key", this.config.apiKey)
		}

		return url
	}

	private convertAnthropicBody(oaiBody: ChatCompletionCreateParams): object {
		const body = this.anthropicInstance._convertToCleanAnthropicBody(oaiBody)
		const { model: _model, ...exceptModel } = body
		return {
			...exceptModel,
			anthropic_version: "vertex-2023-10-16",
		}
	}

	private convertGeminiBody(oaiBody: ChatCompletionCreateParams, url: URL): object {
		return this.geminiInstance._convertBody(oaiBody, url.toString())
	}

	async chatCompletionNonStream(
		body: ChatCompletionCreateParamsNonStreaming,
		signal: AbortSignal,
	): Promise<ChatCompletion> {
		const vertexProvider = this.determineVertexProvider(body.model)

		if (this.config.apiKey && vertexProvider !== "gemini") {
			throw new Error("VertexAI: only gemini models are supported in express (apiKey) mode")
		}

		const headers = await this.getAuthHeaders()
		let url: URL
		let requestBody: any

		switch (vertexProvider) {
			case "anthropic":
				url = this.buildUrl(`publishers/anthropic/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = this.convertAnthropicBody(body)
				break
			case "gemini":
				url = this.buildUrl(`publishers/google/models/${body.model}:generateContent`, vertexProvider)
				requestBody = this.convertGeminiBody(body, url)
				break
			case "mistral":
				url = this.buildUrl(`publishers/mistralai/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = body
				break
			// kilocode_change start
			case "qwen":
				url = this.buildUrl(`publishers/qwen/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = body
				break
			case "llama":
				url = this.buildUrl(`publishers/meta/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = body
				break
			case "deepseek":
				url = this.buildUrl(`publishers/deepseek-ai/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = body
				break
			case "kimi":
				url = this.buildUrl(`publishers/moonshotai/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = body
				break
			case "minimax":
				url = this.buildUrl(`publishers/minimaxai/models/${body.model}:rawPredict`, vertexProvider)
				requestBody = body
				break
			// kilocode_change end
			default:
				throw new Error(`Unsupported model: ${body.model}`)
		}

		// kilocode_change start
		console.error(`[VertexAI Debug] Non-Stream URL: ${url.toString()}`)
		// kilocode_change end

		const response = await fetch(url.toString(), {
			method: "POST",
			headers,
			body: JSON.stringify(requestBody),
			signal,
		})

		const data = await response.json()

		if (!response.ok) {
			logError("VertexAI API Error", {
				status: response.status,
				statusText: response.statusText,
				data,
				url: url.toString(),
			})
			throw new Error(`${response.status} VertexAI API error: ${response.statusText}\n${JSON.stringify(data)}`)
		}

		// Convert response to OpenAI format
		switch (vertexProvider) {
			case "anthropic":
				return chatCompletion({
					content: data.content?.[0]?.text || "",
					model: body.model,
				})
			case "gemini":
				return chatCompletion({
					content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
					model: body.model,
				})
			case "mistral":
			case "qwen":
			case "llama":
			case "deepseek":
			case "kimi":
			case "minimax":
				return chatCompletion({
					content: data.choices?.[0]?.message?.content || "",
					model: body.model,
				})
			default:
				throw new Error(`Unsupported provider: ${vertexProvider}`)
		}
	}

	async *chatCompletionStream(
		body: ChatCompletionCreateParamsStreaming,
		signal: AbortSignal,
	): AsyncGenerator<ChatCompletionChunk> {
		const vertexProvider = this.determineVertexProvider(body.model)

		if (this.config.apiKey && vertexProvider !== "gemini") {
			throw new Error("VertexAI: only gemini models are supported in express (apiKey) mode")
		}

		const headers = await this.getAuthHeaders()
		let url: URL
		let requestBody: any

		switch (vertexProvider) {
			case "anthropic":
				url = this.buildUrl(`publishers/anthropic/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = this.convertAnthropicBody(body)
				break
			case "gemini":
				url = this.buildUrl(`publishers/google/models/${body.model}:streamGenerateContent`, vertexProvider)
				requestBody = this.convertGeminiBody(body, url)
				break
			case "mistral":
				url = this.buildUrl(`publishers/mistralai/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = body
				break
			case "qwen":
				url = this.buildUrl(`publishers/qwen/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = body
				break
			case "llama":
				url = this.buildUrl(`publishers/meta/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = body
				break
			case "deepseek":
				url = this.buildUrl(`publishers/deepseek-ai/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = body
				break
			case "kimi":
				url = this.buildUrl(`publishers/moonshotai/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = body
				break
			case "minimax":
				url = this.buildUrl(`publishers/minimaxai/models/${body.model}:streamRawPredict`, vertexProvider)
				requestBody = body
				break
			default:
				throw new Error(`Unsupported model: ${body.model}`)
		}

		switch (vertexProvider) {
			case "mistral":
			case "qwen":
			case "llama":
			case "deepseek":
			case "kimi":
			case "minimax": {
				const openaiResponse = await this.mistralInstance.openai.chat.completions.create(
					this.mistralInstance.modifyChatBody(body),
					{
						signal,
						headers,
					},
				)
				for await (const result of openaiResponse) {
					yield result
				}
				break
			}
			case "anthropic":
			case "gemini": {
				const response = await fetch(url.toString(), {
					method: "POST",
					headers,
					body: JSON.stringify(requestBody),
					signal,
				})

				if (!response.ok) {
					const data = await response.json()
					throw new Error(
						`VertexAI API error: ${response.status} ${response.statusText}\n${JSON.stringify(data)}`,
					)
				}

				if (response.status === 499) {
					return // Aborted by user
				}
				if (vertexProvider === "gemini") {
					yield* this.geminiInstance.handleStreamResponse(response, body.model)
				} else {
					yield* this.anthropicInstance.handleStreamResponse(response, body.model)
				}
				break
			}
		}
	}

	async completionNonStream(body: CompletionCreateParamsNonStreaming, signal: AbortSignal): Promise<Completion> {
		// Convert completion to chat completion and back
		const promptText =
			typeof body.prompt === "string" ? body.prompt : Array.isArray(body.prompt) ? body.prompt.join("") : ""

		const chatBody: ChatCompletionCreateParamsNonStreaming = {
			model: body.model,
			messages: [{ role: "user", content: promptText }],
			max_tokens: body.max_tokens,
			temperature: body.temperature,
			top_p: body.top_p,
			stop: body.stop,
			stream: false,
		}

		const chatResponse = await this.chatCompletionNonStream(chatBody, signal)

		return {
			id: chatResponse.id,
			object: "text_completion",
			created: chatResponse.created,
			model: chatResponse.model,
			choices: [
				{
					text: chatResponse.choices[0]?.message?.content || "",
					index: 0,
					logprobs: null,
					finish_reason: chatResponse.choices[0]?.finish_reason || null,
				},
			],
			usage: chatResponse.usage,
		} as Completion
	}

	async *completionStream(body: CompletionCreateParamsStreaming, signal: AbortSignal): AsyncGenerator<Completion> {
		// Convert completion to chat completion and back
		const promptText =
			typeof body.prompt === "string" ? body.prompt : Array.isArray(body.prompt) ? body.prompt.join("") : ""

		const chatBody: ChatCompletionCreateParamsStreaming = {
			model: body.model,
			messages: [{ role: "user", content: promptText }],
			max_tokens: body.max_tokens,
			temperature: body.temperature,
			top_p: body.top_p,
			stop: body.stop,
			stream: true,
		}

		for await (const chatChunk of this.chatCompletionStream(chatBody, signal)) {
			yield {
				id: chatChunk.id,
				object: "text_completion",
				created: chatChunk.created,
				model: chatChunk.model,
				choices: [
					{
						text: chatChunk.choices[0]?.delta?.content || "",
						index: 0,
						logprobs: null,
						finish_reason: chatChunk.choices[0]?.finish_reason || null,
					},
				],
			} as Completion
		}
	}

	async *fimStream(body: FimCreateParamsStreaming, signal: AbortSignal): AsyncGenerator<ChatCompletionChunk> {
		// Only Codestral (Mistral) supports FIM in VertexAI
		if (!body.model.includes("codestral")) {
			throw new Error(`FIM is only supported for Codestral models, got: ${body.model}`)
		}

		const headers = await this.getAuthHeaders()
		const url = this.buildUrl(`publishers/mistralai/models/${body.model}:streamRawPredict`, "mistral")

		const requestBody = {
			model: body.model,
			max_tokens: body.max_tokens,
			temperature: body.temperature,
			top_p: body.top_p,
			stream: body.stream ?? true,
			stop: body.stop,
			prompt: body.prompt,
			suffix: body.suffix,
		}

		// kilocode_change start
		console.error(`[VertexAI Debug] FIM URL: ${url.toString()}`)
		// kilocode_change end

		const response = await fetch(url.toString(), {
			method: "POST",
			headers,
			body: JSON.stringify(requestBody),
			signal,
		})

		if (!response.ok) {
			throw new Error(`${response.status} VertexAI API error: ${response.statusText}`)
		}

		for await (const chunk of streamSse(response)) {
			if (chunk.choices?.[0]?.delta?.content) {
				yield chatChunk({
					content: chunk.choices[0].delta.content,
					model: body.model,
				})
			}
		}
	}

	async rerank(): Promise<CreateRerankResponse> {
		throw new Error("Reranking is not supported by VertexAI")
	}

	async list(): Promise<Model[]> {
		throw new Error("VertexAI provider does not support model listing.")
	}
}
