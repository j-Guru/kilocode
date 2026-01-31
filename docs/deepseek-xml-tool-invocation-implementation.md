# DeepSeek XML Tool Invocation Feature Implementation Guide

## Problem Summary

DeepSeek-v3.2 (MaaS) via Vertex AI and Azure OpenAI Foundry generates malformed tool call responses, causing `MODEL_NO_TOOLS_USED` errors. The model produces broken XML structures:

```xml
<invoke name=\"update_todo_list\">{\n  \"todos\": \"[-] Gather model information...invfunction_calls>
```

**Issues:**
- Missing proper closing tags (`</invoke>`, `</function_calls>`)
- Truncated JSON parameters
- Corrupted closing tag patterns (`invfunction_calls>` instead of `</function_calls>`)

## Proposed Solution

Implement a **UI checkbox** and backend processing to handle XML-based tool invocation formats with robust parsing that tolerates malformed responses.

---

## Implementation Plan

### Phase 1: Add UI Checkbox Setting

#### 1.1 Update Type Definitions

**File:** `kilocode/packages/types/src/provider-settings.ts`

Add to `baseProviderSettingsSchema` (~line 200):

```typescript
const baseProviderSettingsSchema = z.object({
  // ... existing fields ...
  
  // Tool invocation format
  toolProtocol: z.enum(["xml", "native"]).optional(), // Already exists
  enableXmlToolParsing: z.boolean().optional(), // NEW: Enable lenient XML parsing
})
```

**File:** `kilocode/packages/types/src/model.ts`

Add to ModelInfo interface:

```typescript
export interface ModelInfo {
  // ... existing fields ...
  
  // Tool calling support
  supportsToolCalls?: boolean
  defaultToolProtocol?: "xml" | "native" // NEW: Default protocol for this model
  requiresLenientParsing?: boolean // NEW: Flag for models with known issues
}
```

#### 1.2 Update Provider-Specific Schemas

**File:** `kilocode/packages/types/src/providers/deepseek.ts`

```typescript
export const deepSeekModels = {
  "deepseek-v3": {
    // ... existing config ...
    supportsToolCalls: true,
    defaultToolProtocol: "xml", // NEW
    requiresLenientParsing: true, // NEW: Enable by default for DeepSeek
  },
  "deepseek-v3.2-maas": {
    // ... existing config ...
    supportsToolCalls: true,
    defaultToolProtocol: "xml",
    requiresLenientParsing: true,
  },
} as const satisfies ModelRecord
```

#### 1.3 Add UI Component

**File:** `kilocode/webview-ui/src/components/settings/ProviderSettings.tsx` (or equivalent)

Add checkbox in the advanced settings section:

```typescript
// In the provider settings form
<FormCheckbox
  label="Enable Lenient XML Tool Parsing"
  description="Use robust XML parsing for models with formatting issues (e.g., DeepSeek). Automatically enabled for compatible models."
  checked={settings.enableXmlToolParsing ?? false}
  onChange={(checked) => updateSetting('enableXmlToolParsing', checked)}
  disabled={!supportsToolCalls}
/>
```

---

### Phase 2: Implement Lenient XML Parser

#### 2.1 Create XML Parser Module

**File:** `kilocode/src/core/tools/xml-parser/lenient-parser.ts` (NEW)

```typescript
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
  standard: /<invoke\s+name=["']([^"']+)["'][^>]*>(.*?)<\/invoke>/gs,
  
  // Malformed patterns (missing closing tags, truncated)
  unclosed: /<invoke\s+name=["']([^"']+)["'][^>]*>([^<]*?)(?:inv|<\/inv|$)/gs,
  
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
    /<function_calls>([\s\S]*?)(?:<\/function_calls>|invfunction_calls>|$)/i
  )
  
  const contentToSearch = functionCallsMatch ? functionCallsMatch[1] : text
  
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
```

#### 2.2 Add Unit Tests

**File:** `kilocode/src/core/tools/xml-parser/__tests__/lenient-parser.spec.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest'
import { parseLenientXmlToolCalls, extractTextFromXml } from '../lenient-parser'

describe('parseLenientXmlToolCalls', () => {
  it('should parse well-formed XML tool calls', () => {
    const xml = `
<function_calls>
<invoke name="read_file">
{"path": "test.txt"}
</invoke>
</function_calls>
    `
    
    const result = parseLenientXmlToolCalls(xml)
    
    expect(result.success).toBe(true)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].name).toBe('read_file')
    expect(result.toolCalls[0].arguments).toBe('{"path": "test.txt"}')
  })
  
  it('should parse malformed XML with truncated closing tags', () => {
    const xml = `
<function_calls>
<invoke name="update_todo_list">{
  "todos": "[-] Task 1\\n[ ] Task 2invfunction_calls>
    `
    
    const result = parseLenientXmlToolCalls(xml)
    
    expect(result.success).toBe(true)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].name).toBe('update_todo_list')
    expect(result.errors.length).toBeGreaterThan(0)
  })
  
  it('should fix incomplete JSON', () => {
    const xml = `
<function_calls>
<invoke name="test_tool">{"key": "value"inv
    `
    
    const result = parseLenientXmlToolCalls(xml)
    
    expect(result.success).toBe(true)
    expect(result.toolCalls).toHaveLength(1)
    // Should have closing brace added
    expect(result.toolCalls[0].arguments).toContain('}')
  })
  
  it('should return empty array for non-tool text', () => {
    const text = "This is just regular text without any tool calls."
    
    const result = parseLenientXmlToolCalls(text)
    
    expect(result.success).toBe(true)
    expect(result.toolCalls).toHaveLength(0)
  })
})

describe('extractTextFromXml', () => {
  it('should remove tool calls and keep text', () => {
    const xml = `
Some text before
<function_calls>
<invoke name="test">{"arg": "val"}</invoke>
</function_calls>
Some text after
    `
    
    const result = extractTextFromXml(xml)
    
    expect(result).toContain('Some text before')
    expect(result).toContain('Some text after')
    expect(result).not.toContain('function_calls')
    expect(result).not.toContain('invoke')
  })
})
```

---

### Phase 3: Integrate Parser into Task Processing

#### 3.1 Update Task.ts to Use Lenient Parser

**File:** `kilocode/src/core/task/Task.ts`

Modify the response processing section (~line 3800):

```typescript
// Add import at top
import { parseLenientXmlToolCalls, extractTextFromXml } from '../tools/xml-parser/lenient-parser'

// In recursivelyMakeClineRequests method, after receiving assistant response:

// Check if lenient XML parsing is enabled
const useLenientParsing = 
  this.providerSettings?.enableXmlToolParsing || 
  this.model?.requiresLenientParsing ||
  this._taskToolProtocol === "xml"

// If using XML protocol and lenient parsing is enabled
if (useLenientParsing && this._taskToolProtocol === "xml") {
  // Get the raw assistant message text
  const assistantText = this.assistantMessageContent
    .filter(block => block.type === "text")
    .map(block => (block as any).text)
    .join("")
  
  // Try lenient XML parsing
  const parseResult = parseLenientXmlToolCalls(assistantText)
  
  if (parseResult.toolCalls.length > 0) {
    // Log any parsing warnings
    if (parseResult.errors.length > 0) {
      console.warn(`[Task#${this.taskId}] XML parsing warnings:`, parseResult.errors)
      await this.say("text", `⚠️ Model response had formatting issues (recovered ${parseResult.toolCalls.length} tool calls)`)
    }
    
    // Convert parsed tool calls to internal format
    for (const toolCall of parseResult.toolCalls) {
      const toolUseIndex = this.assistantMessageContent.length
      
      this.assistantMessageContent.push({
        type: "tool_use",
        id: `toolu_xml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: toolCall.name,
        input: JSON.parse(toolCall.arguments),
        partial: false,
      })
    }
    
    // Extract and update text content (removing tool call XML)
    const cleanText = extractTextFromXml(assistantText)
    if (cleanText) {
      // Update or add text block
      const textBlocks = this.assistantMessageContent.filter(b => b.type === "text")
      if (textBlocks.length > 0) {
        (textBlocks[0] as any).text = cleanText
      }
    }
  }
}

// Continue with existing tool use detection
const didToolUse = this.assistantMessageContent.some(
  (block) => block.type === "tool_use" || block.type === "mcp_tool_use",
)
```

#### 3.2 Update Provider Handlers

**File:** `kilocode/src/api/providers/deepseek.ts`

Add metadata to inform the task about tool protocol:

```typescript
export class DeepSeekHandler extends OpenAiHandler {
  constructor(options: ApiHandlerOptions) {
    super({
      ...options,
      openAiApiKey: options.deepSeekApiKey ?? "not-provided",
      openAiModelId: options.apiModelId ?? deepSeekDefaultModelId,
      openAiBaseUrl: options.deepSeekBaseUrl ?? "https://api.deepseek.com",
      openAiStreamingEnabled: true,
      includeMaxTokens: true,
    })
  }
  
  override getModel(): { id: string; info: ModelInfo } {
    const model = super.getModel()
    
    // Apply DeepSeek-specific defaults
    if (model.id.includes("deepseek-v3")) {
      return {
        ...model,
        info: {
          ...model.info,
          defaultToolProtocol: "xml",
          requiresLenientParsing: true,
        },
      }
    }
    
    return model
  }
}
```

---

### Phase 4: Add Vertex AI Specific Handling

#### 4.1 Update Vertex Handler for DeepSeek

**File:** `kilocode/src/api/providers/anthropic-vertex.ts`

Add DeepSeek detection:

```typescript
export class AnthropicVertexHandler extends BaseProvider implements SingleCompletionHandler {
  // ... existing code ...
  
  private isDeepSeekModel(): boolean {
    return this.options.apiModelId?.toLowerCase().includes('deepseek') ?? false
  }
  
  override async *createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata: ApiHandlerMessageMetadata,
  ): ApiStream {
    // Enable XML parsing for DeepSeek models
    if (this.isDeepSeekModel()) {
      // Force XML tool protocol
      metadata = {
        ...metadata,
        tool_protocol: "xml",
      }
    }
    
    // Continue with existing implementation...
  }
}
```

---

### Phase 5: Update Settings UI

#### 5.1 Add to Advanced Settings Panel

**File:** `kilocode/webview-ui/src/components/settings/providers/AdvancedSettings.tsx`

```typescript
// In the advanced settings section
{model?.supportsToolCalls && (
  <SettingCard
    title="Tool Invocation Format"
    description="Configure how tool calls are formatted and parsed"
  >
    <RadioGroup
      value={settings.toolProtocol || model?.defaultToolProtocol || "native"}
      onChange={(value) => updateSetting('toolProtocol', value)}
      options={[
        { value: 'native', label: 'Native', description: 'Use provider\'s native tool format' },
        { value: 'xml', label: 'XML', description: 'Use XML-based tool invocations' },
      ]}
    />
    
    {settings.toolProtocol === 'xml' && (
      <FormCheckbox
        label="Enable Lenient XML Parsing"
        description="Automatically fix malformed XML tool responses (recommended for DeepSeek)"
        checked={settings.enableXmlToolParsing ?? model?.requiresLenientParsing ?? false}
        onChange={(checked) => updateSetting('enableXmlToolParsing', checked)}
      />
    )}
  </SettingCard>
)}
```

---

### Phase 6: Testing & Validation

#### 6.1 Manual Testing Checklist

- [ ] Test with DeepSeek-v3.2 via Vertex AI
- [ ] Test with DeepSeek-v3.2 via Azure OpenAI Foundry
- [ ] Verify checkbox appears in settings UI
- [ ] Verify automatic enabling for DeepSeek models
- [ ] Test with well-formed tool calls (should work normally)
- [ ] Test with malformed tool calls (should recover)
- [ ] Test with no tool calls (should not error)
- [ ] Verify error messages are user-friendly

#### 6.2 Integration Tests

**File:** `kilocode/src/core/task/__tests__/xml-tool-parsing.spec.ts` (NEW)

```typescript
describe("XML Tool Parsing Integration", () => {
  it("should handle DeepSeek malformed responses", async () => {
    // Setup task with DeepSeek model
    // Mock response with malformed XML
    // Verify tool calls are extracted correctly
  })
  
  it("should show warning for recovered tool calls", async () => {
    // Setup task with lenient parsing enabled
    // Mock malformed response
    // Verify warning message is displayed
  })
  
  it("should fall back gracefully if parsing fails", async () => {
    // Setup task
    // Mock completely broken response
    // Verify MODEL_NO_TOOLS_USED error is still shown appropriately
  })
})
```

---

## Migration Path

### For Existing DeepSeek Users

1. **Automatic Detection**: When a user selects DeepSeek-v3.2, automatically enable `enableXmlToolParsing`
2. **Migration Message**: Show one-time notification:
   ```
   "DeepSeek model detected. Enabling enhanced XML parsing for better compatibility."
   ```
3. **Settings Persistence**: Save preference to user settings

### Configuration Priority

1. Explicit user setting (`enableXmlToolParsing`)
2. Model-level default (`requiresLenientParsing`)
3. Tool protocol setting (`toolProtocol === "xml"`)

---

## Performance Considerations

1. **Lazy Loading**: Only load XML parser when needed
2. **Caching**: Cache parse results for repeated content
3. **Fallback**: If lenient parsing takes >100ms, log warning and use standard parsing
4. **Memory**: Limit parser to process max 100KB of text

---

## Documentation Updates

### User-Facing Documentation

**File:** `kilocode/docs/models/deepseek.md` (NEW)

```markdown
# Using DeepSeek Models

## Known Issues & Solutions

### Tool Call Formatting (v3.2)

DeepSeek-v3.2 may produce malformed XML tool responses. Kilo Code automatically detects and fixes these issues.

**What happens:**
- Automatic XML parsing enhancement
- Warning message if response needed recovery
- No action required from you

**Manual Configuration:**
Settings → Advanced → Enable Lenient XML Parsing ✓
```

---

## Rollout Plan

### Phase 1: Internal Testing (Week 1)
- Deploy to dev environment
- Test with team members using DeepSeek

### Phase 2: Beta Release (Week 2)
- Release to beta testers
- Gather feedback on error recovery
- Monitor telemetry for parsing failures

### Phase 3: General Release (Week 3)
- Roll out to all users
- Monitor support tickets
- Document common issues

---

## Success Metrics

1. **Error Reduction**: `MODEL_NO_TOOLS_USED` errors for DeepSeek < 5%
2. **User Satisfaction**: >90% of DeepSeek users report working tool calls
3. **Performance**: XML parsing overhead < 50ms per response
4. **Recovery Rate**: >95% of malformed responses successfully parsed

---

## Future Enhancements

1. **Adaptive Parsing**: Learn from failures to improve recovery
2. **Model-Specific Parsers**: Custom parsers for each problematic model
3. **Telemetry**: Track parsing success rates per model
4. **Auto-Retry**: Automatically retry with corrected format on first failure

---

## Technical Debt & Cleanup

1. Remove lenient parsing after models fix their output
2. Consolidate XML parsing logic across providers
3. Extract common tool call normalization logic

---

## Related Issues

- Issue #XXX: DeepSeek-v3.2 tool call failures
- Issue #YYY: MODEL_NO_TOOLS_USED error improvements
- PR #ZZZ: Native tool protocol support

---

## Questions & Answers

**Q: Why not fix this at the API provider level?**
A: We don't control Vertex AI or Azure OpenAI. This gives users immediate relief.

**Q: Will this work with other models?**
A: Yes! Any model with malformed XML can benefit from lenient parsing.

**Q: Performance impact?**
A: Minimal. Only active when enabled, adds <50ms per response.

**Q: Can I disable it?**
A: Yes, uncheck "Enable Lenient XML Parsing" in advanced settings.