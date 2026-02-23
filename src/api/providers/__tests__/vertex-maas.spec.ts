import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ApiHandlerOptions } from "../../../shared/api"
import { vertexModels } from "@roo-code/types"

const constructedOptions: ApiHandlerOptions[] = []
const authOptionsUsed: Array<{ keyFile?: string }> = []

vi.mock("../openai", () => ({
	OpenAiHandler: class {
		options: ApiHandlerOptions

		constructor(options: ApiHandlerOptions) {
			this.options = options
			constructedOptions.push(options)
		}

		async *createMessage() {
			yield { type: "text", text: "ok" }
		}

		async completePrompt() {
			return "ok"
		}

		getModel() {
			return {
				id: this.options.openAiModelId ?? "",
				info: this.options.openAiCustomModelInfo ?? {},
			}
		}
	},
}))

vi.mock("google-auth-library", () => ({
	GoogleAuth: vi.fn().mockImplementation((options: any) => {
		authOptionsUsed.push(options)
		return {
			getClient: vi.fn().mockResolvedValue({
				getAccessToken: vi.fn().mockResolvedValue({ token: "test-token" }),
			}),
		}
	}),
}))

import { VertexMaaSHandler } from "../vertex-maas"

describe("VertexMaaSHandler", () => {
	beforeEach(() => {
		constructedOptions.length = 0
		authOptionsUsed.length = 0
		vi.clearAllMocks()
	})

	it("builds the OpenAI-compatible base URL for regional endpoints", async () => {
		const handler = new VertexMaaSHandler({
			apiModelId: "deepseek-v3.2-maas",
			vertexProjectId: "test-project",
			vertexRegion: "us-central1",
		})

		for await (const _ of handler.createMessage("system", [{ role: "user", content: "Hi" }])) {
			break
		}

		expect(constructedOptions).toHaveLength(1)
		expect(constructedOptions[0]?.openAiBaseUrl).toBe(
			"https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/endpoints/openapi",
		)
		expect(constructedOptions[0]?.openAiApiKey).toBe("test-token")
		expect(constructedOptions[0]?.openAiModelId).toBe("deepseek-v3.2-maas")
		expect(constructedOptions[0]?.openAiCustomModelInfo).toBe(vertexModels["deepseek-v3.2-maas"])
	})

	it("builds the OpenAI-compatible base URL for global endpoints", async () => {
		const handler = new VertexMaaSHandler({
			apiModelId: "deepseek-v3.2-maas",
			vertexProjectId: "test-project",
			vertexRegion: "global",
		})

		for await (const _ of handler.createMessage("system", [{ role: "user", content: "Hi" }])) {
			break
		}

		expect(constructedOptions).toHaveLength(1)
		expect(constructedOptions[0]?.openAiBaseUrl).toBe(
			"https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/endpoints/openapi",
		)
	})

	it("normalizes Windows key file paths", async () => {
		const handler = new VertexMaaSHandler({
			apiModelId: "deepseek-v3.2-maas",
			vertexProjectId: "test-project",
			vertexRegion: "us-central1",
			vertexKeyFile: "C:\\Users\\me\\vertex.json",
		})

		for await (const _ of handler.createMessage("system", [{ role: "user", content: "Hi" }])) {
			break
		}

		expect(authOptionsUsed).toHaveLength(1)
		expect(authOptionsUsed[0]?.keyFile).toBe("C:/Users/me/vertex.json")
	})
})
