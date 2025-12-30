import { type ToolName, toolNames } from "@roo-code/types"

import { TextContent, ToolUse, McpToolUse, ToolParamName, toolParamNames } from "../../shared/tools"

export type AssistantMessageContent = TextContent | ToolUse | McpToolUse

export function parseAssistantMessage(assistantMessage: string): AssistantMessageContent[] {
	let contentBlocks: AssistantMessageContent[] = []
	let currentTextContent: TextContent | undefined = undefined
	let currentTextContentStartIndex = 0
	let currentToolUse: ToolUse | undefined = undefined
	let currentToolUseStartIndex = 0
	let currentParamName: ToolParamName | undefined = undefined
	let currentParamValueStartIndex = 0
	let accumulator = ""

	for (let i = 0; i < assistantMessage.length; i++) {
		const char = assistantMessage[i]
		accumulator += char

		// There should not be a param without a tool use.
		if (currentToolUse && currentParamName) {
			const currentParamValue = accumulator.slice(currentParamValueStartIndex)
			const paramClosingTag = `</${currentParamName}>`
			const geminiParamClosingTag = `</parameter>` // kilocode_change
			if (currentParamValue.endsWith(paramClosingTag) || currentParamValue.endsWith(geminiParamClosingTag)) {
				// kilocode_change
				// End of param value.
				// Don't trim content parameters to preserve newlines, but strip first and last newline only
				// kilocode_change start
				let closingTagLength = currentParamValue.endsWith(paramClosingTag)
					? paramClosingTag.length
					: geminiParamClosingTag.length
				let paramValue = currentParamValue.slice(0, -closingTagLength).trim()
				// kilocode_change end

				// kilocode_change start
				if (currentToolUse.name === "execute_command" && currentParamName === "command") {
					// Some models XML encode ampersands in the <command></command> tag, some don't
					// to minimize chances of unintended consequences, we only XML decode &amp; for now
					// NOTE(emn): this is a hacky workaround to an empirically observed problem.
					// We know it's not a perfect solution and in corner cases can make things worse, but let's try this for now.
					paramValue = paramValue.replaceAll("&amp;", "&")
				}
				// kilocode_change end

				currentToolUse.params[currentParamName] =
					currentParamName === "content"
						? paramValue.replace(/^\n/, "").replace(/\n$/, "")
						: paramValue.trim()
				currentParamName = undefined
				continue
			} else {
				// Partial param value is accumulating.
				continue
			}
		}

		// No currentParamName.

		if (currentToolUse) {
			const currentToolValue = accumulator.slice(currentToolUseStartIndex)
			const toolUseClosingTag = `</${currentToolUse.name}>`
			const geminiToolClosingTag = `</invoke>` // kilocode_change
			if (currentToolValue.endsWith(toolUseClosingTag) || currentToolValue.endsWith(geminiToolClosingTag)) {
				// kilocode_change
				// End of a tool use.
				currentToolUse.partial = false
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined
				continue
			} else {
				const possibleParamOpeningTags = toolParamNames.map((name) => `<${name}>`)
				for (const paramOpeningTag of possibleParamOpeningTags) {
					if (accumulator.endsWith(paramOpeningTag)) {
						// Start of a new parameter.
						currentParamName = paramOpeningTag.slice(1, -1) as ToolParamName
						currentParamValueStartIndex = accumulator.length
						break
					}
				}

				// kilocode_change start
				if (!currentParamName) {
					const geminiParamMatch = accumulator.match(/<parameter name="([^"]+)"[^>]*>$/)
					if (geminiParamMatch) {
						const paramName = geminiParamMatch[1] as ToolParamName
						if (toolParamNames.includes(paramName)) {
							currentParamName = paramName
							currentParamValueStartIndex = accumulator.length
						}
					}
				}
				// kilocode_change end

				// There's no current param, and not starting a new param.

				// Special case for write_to_file where file contents could
				// contain the closing tag, in which case the param would have
				// closed and we end up with the rest of the file contents here.
				// To work around this, we get the string between the starting
				// content tag and the LAST content tag.
				const contentParamName: ToolParamName = "content"
				// kilocode_change start
				// Check for both standard and Gemini param tags
				const isGeminiParam = accumulator.endsWith(`</parameter>`)
				if (
					(currentToolUse.name === "write_to_file" || currentToolUse.name === "new_rule") &&
					(accumulator.endsWith(`</${contentParamName}>`) || isGeminiParam)
				) {
					// kilocode_change end
					const toolContent = accumulator.slice(currentToolUseStartIndex)
					const contentStartTag = `<${contentParamName}>`
					const contentEndTag = `</${contentParamName}>`
					const contentStartIndex = toolContent.indexOf(contentStartTag) + contentStartTag.length
					const contentEndIndex = toolContent.lastIndexOf(contentEndTag)

					if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
						// Don't trim content to preserve newlines, but strip first and last newline only
						currentToolUse.params[contentParamName] = toolContent
							.slice(contentStartIndex, contentEndIndex)
							.replace(/^\n/, "")
							.replace(/\n$/, "")
					}
				}

				// Partial tool value is accumulating.
				continue
			}
		}

		// No currentToolUse.

		let didStartToolUse = false
		const possibleToolUseOpeningTags = toolNames.map((name) => `<${name}>`)

		for (const toolUseOpeningTag of possibleToolUseOpeningTags) {
			if (accumulator.endsWith(toolUseOpeningTag)) {
				// Start of a new tool use.
				currentToolUse = {
					type: "tool_use",
					name: toolUseOpeningTag.slice(1, -1) as ToolName,
					params: {},
					partial: true,
				}

				currentToolUseStartIndex = accumulator.length

				// This also indicates the end of the current text content.
				if (currentTextContent) {
					currentTextContent.partial = false

					// Remove the partially accumulated tool use tag from the
					// end of text (<tool).
					currentTextContent.content = currentTextContent.content
						.slice(0, -toolUseOpeningTag.slice(0, -1).length)
						.trim()

					contentBlocks.push(currentTextContent)
					currentTextContent = undefined
				}

				didStartToolUse = true
				break
			}
		}

		// kilocode_change start
		if (!didStartToolUse) {
			const geminiInvokeMatch = accumulator.match(/<invoke name="([^"]+)">$/)
			if (geminiInvokeMatch) {
				const toolName = geminiInvokeMatch[1] as ToolName
				if (toolNames.includes(toolName)) {
					currentToolUse = {
						type: "tool_use",
						name: toolName,
						params: {},
						partial: true,
					}
					currentToolUseStartIndex = accumulator.length

					if (currentTextContent) {
						currentTextContent.partial = false
						// Remove <invoke name="...">
						currentTextContent.content = currentTextContent.content
							.slice(0, -geminiInvokeMatch[0].length)
							.trim()
						contentBlocks.push(currentTextContent)
						currentTextContent = undefined
					}
					didStartToolUse = true
				}
			}
		}
		// kilocode_change end

		if (!didStartToolUse) {
			// No tool use, so it must be text either at the beginning or
			// between tools.
			if (currentTextContent === undefined) {
				currentTextContentStartIndex = i
			}

			currentTextContent = {
				type: "text",
				content: accumulator.slice(currentTextContentStartIndex).trim(),
				partial: true,
			}
		}
	}

	if (currentToolUse) {
		// Stream did not complete tool call, add it as partial.
		if (currentParamName) {
			// Tool call has a parameter that was not completed.
			// Don't trim content parameters to preserve newlines, but strip first and last newline only
			const paramValue = accumulator.slice(currentParamValueStartIndex)
			currentToolUse.params[currentParamName] =
				currentParamName === "content" ? paramValue.replace(/^\n/, "").replace(/\n$/, "") : paramValue.trim()
		}

		contentBlocks.push(currentToolUse)
	}

	// NOTE: It doesn't matter if check for currentToolUse or
	// currentTextContent, only one of them will be defined since only one can
	// be partial at a time.
	if (currentTextContent) {
		// Stream did not complete text content, add it as partial.
		contentBlocks.push(currentTextContent)
	}

	return contentBlocks
}
