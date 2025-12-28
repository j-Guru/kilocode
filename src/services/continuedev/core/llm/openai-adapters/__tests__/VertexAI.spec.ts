import { VertexAIApi } from "../apis/VertexAI.js"

const makeKeyJson = () =>
	JSON.stringify({
		type: "service_account",
		client_email: "test@example.com",
		private_key: "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n",
	})

const makeApi = (region: string) =>
	new VertexAIApi({
		provider: "vertexai",
		env: {
			region,
			projectId: "test-project",
			keyJson: makeKeyJson(),
		},
	})

describe("VertexAIApi", () => {
	const originalFetch = global.fetch

	afterEach(() => {
		global.fetch = originalFetch
		vi.restoreAllMocks()
	})

	it("uses the OpenAI-compatible endpoint for MaaS models", async () => {
		const api = makeApi("global")
		vi.spyOn(api as any, "getAuthHeaders").mockResolvedValue({ "Content-Type": "application/json" })

		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
			)
		global.fetch = fetchSpy

		await api.chatCompletionNonStream(
			{
				model: "llama-4-maverick-17b-128e-instruct-maas",
				messages: [{ role: "user", content: "Hi" }],
				stream: false,
			},
			new AbortController().signal,
		)

		expect(fetchSpy).toHaveBeenCalledTimes(1)
		const [url, options] = fetchSpy.mock.calls[0]
		expect(url).toBe(
			"https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/endpoints/openapi/chat/completions",
		)
		const body = JSON.parse((options as RequestInit).body as string)
		expect(body.model).toBe("llama-4-maverick-17b-128e-instruct-maas")
	})

	it("uses the native Gemini endpoint for Gemini models", async () => {
		const api = makeApi("us-central1")
		vi.spyOn(api as any, "getAuthHeaders").mockResolvedValue({ "Content-Type": "application/json" })

		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
				status: 200,
			}),
		)
		global.fetch = fetchSpy

		await api.chatCompletionNonStream(
			{
				model: "gemini-2.5-flash",
				messages: [{ role: "user", content: "Hi" }],
				stream: false,
			},
			new AbortController().signal,
		)

		expect(fetchSpy).toHaveBeenCalledTimes(1)
		const [url] = fetchSpy.mock.calls[0]
		expect(url).toBe(
			"https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
		)
	})

	it("streams OpenAI-compatible responses from the OpenAI endpoint", async () => {
		const api = makeApi("us-central1")
		vi.spyOn(api as any, "getAuthHeaders").mockResolvedValue({ "Content-Type": "application/json" })

		const encoder = new TextEncoder()
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"gpt-oss-20b-maas","choices":[{"delta":{"content":"hello","role":"assistant"},"index":0,"finish_reason":null}]}\n\n',
					),
				)
				controller.enqueue(encoder.encode("data: [DONE]\n\n"))
				controller.close()
			},
		})

		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		)
		global.fetch = fetchSpy

		const chunks = [] as any[]
		for await (const chunk of api.chatCompletionStream(
			{
				model: "gpt-oss-20b-maas",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			},
			new AbortController().signal,
		)) {
			chunks.push(chunk)
		}

		expect(fetchSpy).toHaveBeenCalledTimes(1)
		const [url, options] = fetchSpy.mock.calls[0]
		expect(url).toBe(
			"https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/endpoints/openapi/chat/completions",
		)
		const body = JSON.parse((options as RequestInit).body as string)
		expect(body.stream).toBe(true)
		expect(chunks[0]?.choices?.[0]?.delta?.content).toBe("hello")
	})
})
