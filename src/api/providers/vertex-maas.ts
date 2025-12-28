import type { Anthropic } from "@anthropic-ai/sdk"
import { GoogleAuth, type AuthClient, type JWTInput } from "google-auth-library"

import { type ModelInfo, type VertexModelId, vertexDefaultModelId, vertexModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { safeJsonParse } from "../../shared/safeJsonParse"

import type { ApiHandlerCreateMessageMetadata, SingleCompletionHandler } from "../index"
import { getModelParams } from "../transform/model-params"
import type { ApiStream } from "../transform/stream"

import { BaseProvider } from "./base-provider"
import { OpenAiHandler } from "./openai"

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

		if (this.options.vertexJsonCredentials && this.options.vertexKeyFile) {
			throw new Error("VertexAI credentials can be configured with either vertexJsonCredentials or vertexKeyFile")
		}

		this.authClientPromise = this.createAuthClient()
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const handler = await this.buildOpenAiHandler()
		yield* handler.createMessage(systemPrompt, messages, metadata)
	}

	async completePrompt(prompt: string): Promise<string> {
		const handler = await this.buildOpenAiHandler()
		return handler.completePrompt(prompt)
	}

	override getModel() {
		const modelId = this.options.apiModelId
		const id = modelId && modelId in vertexModels ? (modelId as VertexModelId) : vertexDefaultModelId
		const info: ModelInfo = vertexModels[id]
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	private async buildOpenAiHandler(): Promise<OpenAiHandler> {
		const accessToken = await this.getAccessToken()
		const baseUrl = this.buildOpenAiBaseUrl()
		const model = this.getModel()

		return new OpenAiHandler({
			...this.options,
			openAiBaseUrl: baseUrl,
			openAiApiKey: accessToken,
			openAiModelId: model.id,
			openAiCustomModelInfo: model.info,
		})
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
			if (!credentials?.private_key) {
				throw new Error("VertexAI: vertexJsonCredentials must contain a valid private key")
			}
			credentials.private_key = credentials.private_key.replace(/\\n/g, "\n")
			authOptions.credentials = credentials
		} else if (this.options.vertexKeyFile) {
			authOptions.keyFile = this.options.vertexKeyFile.replace(/\\/g, "/")
		}

		return new GoogleAuth(authOptions).getClient()
	}

	private buildOpenAiBaseUrl(): string {
		const projectId = this.options.vertexProjectId
		const region = this.options.vertexRegion

		if (!projectId || !region) {
			throw new Error("vertexProjectId and vertexRegion are required for Vertex MaaS models")
		}

		const host = region === "global" ? "aiplatform.googleapis.com" : `${region}-aiplatform.googleapis.com`
		return `https://${host}/v1/projects/${projectId}/locations/${region}/endpoints/openapi`
	}
}
