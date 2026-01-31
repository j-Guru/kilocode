/**
 * Lenient XML parser for tool invocations that handles malformed responses
 * from models like DeepSeek-v3.2
 */

export interface ParsedToolCall {
  id?: string
  name: string
  arguments: string
  raw: string
}

export interface XmlParseResult {
  success: boolean
  toolCalls: ParsedToolCall[]
  errors: string[]
}

/**
 * Patterns to detect tool invocations even with malformed XML
 */
const PATTERNS = {
  // Standard well-formed pattern
  standard: /<invoke\s+name=["']([^"']+)["'][^>]*>(.*?)<\/invoke>/g,

  // Malformed patterns (missing closing tags, truncated)
  unclosed: /<invoke\s+name=["']([^"']+)["'][^>]*>([^<]*?)(?:inv|<\/inv|$)/g,

  // Capture function_calls wrapper (may be malformed)
  functionCallsStart: /<function_calls>/i,
  functionCallsEnd: /<\/function_calls>|invfunction_calls>/i,
}

/**
 * Parse tool invocations from potentially malformed XML
 */
export function parseLenientXmlToolCalls(text: string): XmlParseResult {
  const toolCalls: ParsedToolCall[] = []
  const errors: string[] = []

  // Check if there's any function_calls wrapper
  const hasFunctionCalls = PATTERNS.functionCallsStart.test(text)

  if (!hasFunctionCalls) {
    return { success: true, toolCalls: [], errors: [] }
  }

  // Extract content between function_calls tags (even if malformed)
  const functionCallsMatch = text.match(
    /<function_calls>[\s\S]*?(?:<\/function_calls>|invfunction_calls>|$)/i
  )

  const contentToSearch = functionCallsMatch ? functionCallsMatch[0] : text

  // Try standard parsing first
  let matches = Array.from(contentToSearch.matchAll(PATTERNS.standard))

  if (matches.length === 0) {
    // Fallback to lenient parsing for malformed XML
    matches = Array.from(contentToSearch.matchAll(PATTERNS.unclosed))

    if (matches.length > 0) {
      errors.push("Detected malformed XML tool invocations - using lenient parser")
    }
  }

  for (const match of matches) {
    const [raw, name, argsText] = match

    try {
      // Try to extract JSON arguments
      const jsonMatch = argsText.match(/\{[\s\S]*\}/)
      const parsedArgs = jsonMatch ? jsonMatch[0] : argsText

      // Attempt to fix incomplete JSON
      const fixedArgs = fixIncompleteJson(parsedArgs)

      toolCalls.push({
        name: name.trim(),
        arguments: fixedArgs,
        raw,
      })
    } catch (error) {
      errors.push(`Failed to parse tool call "${name}": ${error}`)
    }
  }

  return {
    success: toolCalls.length > 0 || errors.length === 0,
    toolCalls,
    errors,
  }
}

/**
 * Attempt to fix incomplete JSON by adding missing closing braces
 */
function fixIncompleteJson(json: string): string {
  try {
    // If it parses, return as-is
    JSON.parse(json)
    return json
  } catch {
    // Count opening and closing braces
    const openBraces = (json.match(/\{/g) || []).length
    const closeBraces = (json.match(/\}/g) || []).length
    const openBrackets = (json.match(/\[/g) || []).length
    const closeBrackets = (json.match(/\]/g) || []).length

    let fixed = json.trim()

    // Add missing closing brackets
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixed += ']'
    }

    // Add missing closing braces
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixed += '}'
    }

    // Try to fix unclosed strings
    const quoteCount = (fixed.match(/"/g) || []).length
    if (quoteCount % 2 !== 0) {
      fixed += '"'
    }

    try {
      JSON.parse(fixed)
      return fixed
    } catch {
      // If still invalid, return original
      return json
    }
  }
}

/**
 * Extract text content from XML response, excluding tool calls
 */
export function extractTextFromXml(text: string): string {
  // Remove function_calls blocks entirely
  const withoutToolCalls = text.replace(
    /<function_calls>[\s\S]*?(?:<\/function_calls>|invfunction_calls>|$)/gi,
    ''
  )

  return withoutToolCalls.trim()
}
