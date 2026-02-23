# DeepSeek Tool Call Error - Quick Fix Summary

## Problem
DeepSeek-v3.2 (MaaS) via Vertex AI or Azure OpenAI Foundry produces malformed XML tool responses:
```xml
<invoke name="update_todo_list">{"todos": "...invfunction_calls>
```
Missing closing tags → `MODEL_NO_TOOLS_USED` error

## Root Cause
- Model generates broken XML (truncated closing tags, incomplete JSON)
- Kilo Code's parser expects well-formed XML
- Parser fails → no tools detected → error loop

## Solution: Add "Lenient XML Parsing" Feature

### High-Level Approach
1. **New UI Checkbox**: "Enable Lenient XML Tool Parsing" (auto-enabled for DeepSeek)
2. **Robust Parser**: Handles malformed XML with smart recovery
3. **Automatic Detection**: Models with `requiresLenientParsing: true` use it by default

### Key Components

#### 1. Settings Schema Update
**File**: `packages/types/src/provider-settings.ts`
```typescript
enableXmlToolParsing?: boolean  // NEW setting
```

#### 2. Model Metadata Update
**File**: `packages/types/src/providers/deepseek.ts`
```typescript
{
  supportsToolCalls: true,
  defaultToolProtocol: "xml",
  requiresLenientParsing: true  // Auto-enable fix
}
```

#### 3. Lenient XML Parser
**File**: `src/core/tools/xml-parser/lenient-parser.ts` (NEW)
- Regex patterns for malformed XML
- JSON repair logic (add missing braces)
- Fallback parsing strategies
- Error recovery & reporting

#### 4. Task Integration
**File**: `src/core/task/Task.ts`
```typescript
if (useLenientParsing && toolProtocol === "xml") {
  const result = parseLenientXmlToolCalls(assistantText)
  // Convert to tool_use blocks
}
```

#### 5. UI Component
**File**: `webview-ui/src/components/settings/AdvancedSettings.tsx`
```tsx
<FormCheckbox
  label="Enable Lenient XML Parsing"
  description="Fix malformed tool responses (recommended for DeepSeek)"
  checked={enableXmlToolParsing}
/>
```

### Parser Features
✅ Handles truncated closing tags (`invfunction_calls>`)
✅ Fixes incomplete JSON (`{"key": "val` → `{"key": "val"}`)
✅ Extracts tool calls from broken XML
✅ Reports warnings without blocking execution
✅ Falls back gracefully on total failure

### User Experience
**Before:**
```
[ERROR] You did not use a tool in your previous response!
```
(Infinite loop)

**After:**
```
⚠️ Model response had formatting issues (recovered 1 tool call)
```
(Continues working)

## Implementation Priority

### Must Have (MVP)
- [ ] Lenient XML parser (`lenient-parser.ts`)
- [ ] Settings schema update (`provider-settings.ts`)
- [ ] Task integration (`Task.ts`)
- [ ] DeepSeek model metadata (`deepseek.ts`)

### Should Have (Beta)
- [ ] UI checkbox component
- [ ] Unit tests (parser logic)
- [ ] Integration tests (end-to-end)
- [ ] User documentation

### Nice to Have (Future)
- [ ] Telemetry for parse success rates
- [ ] Per-model parser customization
- [ ] Automatic retry with fixes
- [ ] Learning from failures

## Testing Strategy

### Unit Tests
```typescript
// lenient-parser.spec.ts
✓ Parse well-formed XML
✓ Parse malformed XML (truncated tags)
✓ Fix incomplete JSON
✓ Handle multiple tool calls
✓ Extract text content
```

### Integration Tests
```typescript
// xml-tool-parsing.spec.ts
✓ DeepSeek malformed response → recovered tool calls
✓ Warning message displayed
✓ Falls back on complete failure
✓ Works with other models
```

### Manual Testing
- [ ] DeepSeek-v3.2 via Vertex AI
- [ ] DeepSeek-v3.2 via Azure OpenAI Foundry
- [ ] Checkbox auto-enables for DeepSeek
- [ ] Can be disabled manually
- [ ] No regression on other models

## Migration

### Existing Users
- Automatic: Setting enabled when DeepSeek model selected
- Notification: "Enhanced XML parsing enabled for DeepSeek"
- No action required

### New Users
- Default: Enabled for DeepSeek models
- Can opt-out in advanced settings

## Performance Impact
- Parsing overhead: **<50ms per response**
- Only active when enabled
- No impact on other models
- Memory: Limited to 100KB text processing

## Files to Create/Modify

### New Files (4)
1. `src/core/tools/xml-parser/lenient-parser.ts` - Parser implementation
2. `src/core/tools/xml-parser/__tests__/lenient-parser.spec.ts` - Unit tests
3. `src/core/task/__tests__/xml-tool-parsing.spec.ts` - Integration tests
4. `docs/models/deepseek.md` - User documentation

### Modified Files (6)
1. `packages/types/src/provider-settings.ts` - Add setting schema
2. `packages/types/src/model.ts` - Add model metadata fields
3. `packages/types/src/providers/deepseek.ts` - Update DeepSeek config
4. `src/core/task/Task.ts` - Integrate parser
5. `src/api/providers/deepseek.ts` - Override getModel()
6. `webview-ui/src/components/settings/AdvancedSettings.tsx` - Add checkbox

## Rollout Timeline

**Week 1**: Core implementation + unit tests
**Week 2**: Integration + UI + internal testing
**Week 3**: Beta release to select users
**Week 4**: General release + documentation

## Success Metrics
- `MODEL_NO_TOOLS_USED` errors for DeepSeek: **< 5%**
- Tool call recovery rate: **> 95%**
- User satisfaction: **> 90%**
- Performance overhead: **< 50ms**

## Alternative Considered

### 1. Provider-Level Fix
❌ We don't control Vertex AI/Azure APIs

### 2. Prompt Engineering
❌ Doesn't fix model's inherent XML formatting issue

### 3. Switch to Native Tool Format
❌ DeepSeek MaaS may not support it, or has same issues

### 4. ✅ Lenient Client-Side Parsing (CHOSEN)
- ✅ Immediate relief for users
- ✅ Works regardless of provider
- ✅ Minimal performance impact
- ✅ Easy to disable/remove later

## FAQ

**Q: Will this fix all DeepSeek issues?**
A: It fixes malformed XML tool responses. Other issues may remain.

**Q: Does it work with other models?**
A: Yes! Any model with XML formatting issues can benefit.

**Q: Performance impact?**
A: <50ms per response, only when enabled.

**Q: Can I disable it?**
A: Yes, uncheck "Enable Lenient XML Parsing" in advanced settings.

**Q: Why not wait for provider to fix it?**
A: Users need a solution now. We can remove this later if providers fix it.

## Next Steps

1. Review this implementation plan
2. Create feature branch: `feature/lenient-xml-tool-parsing`
3. Implement core parser with tests
4. Add settings integration
5. Test with real DeepSeek API calls
6. Create PR with documentation
7. Beta test with affected users
8. Roll out to production

---

**Full Implementation Guide**: See `deepseek-xml-tool-invocation-implementation.md`
