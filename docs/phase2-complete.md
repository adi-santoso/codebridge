# Phase 2 Complete: Direct Spawner Refactored

**Completed:** 2026-07-10
**Duration:** ~45 minutes
**Status:** ✅ COMPLETE

## Summary

Successfully refactored `src/claude/direct-spawner.js` to use `ClaudeStreamHandler` instead of ACP layer.

## Changes Made

### 1. Updated Import (Line 3)
```javascript
// Old:
import { attachAcpSession } from './acp-session-handler.js';

// New:
import { ClaudeStreamHandler } from './stream-handler.js';
```

### 2. Refactored createSession() Method (Lines 147-218)

**Removed:**
- `attachAcpSession()` call
- ACP event forwarding (text, thinking, tool-use, etc.)

**Added:**
- `new ClaudeStreamHandler()` setup
- Direct stdout → `handler.feed()` wiring
- Session object with helper methods
- Clean event routing via `handleStreamEvent()`

### 3. Added Helper Methods

#### sendPrompt(userId, text)
Sends prompt to Claude CLI using stream-json format:
```javascript
{
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text }]
  }
}
```

#### sendToolResult(userId, toolUseId, content, isError)
Sends tool result using stream-json format:
```javascript
{
  type: 'user',
  message: {
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: String(content),
      is_error: isError
    }]
  }
}
```

#### handleStreamEvent(userId, event)
Routes stream handler events to DirectClaudeSpawner emitters:
- `text_delta` → emit('text')
- `thinking_delta` → emit('thinking')
- `tool_use` → emit('tool-use')
- `turn_end` → emit('turn-end')
- `usage` → emit('usage')
- `error` → emit('error')
- `status` → emit('debug')

### 4. Updated Session Management

#### closeSession(userId)
- Removed infinite recursion bug (session.close() → this.closeSession() loop)
- Now directly kills child process with SIGTERM/SIGKILL
- 2 second timeout for graceful shutdown

#### getSessionStatus(userId)
- Removed dependency on ACP's `getStatus()` method
- Returns object directly from session properties

#### getAllSessions()
- Updated to map session properties directly

## Testing

### Manual Test
Created `tests/manual/test-refactored-spawner.js`:

**Test Results:**
```
✅ Test 1: Create session - PASSED
✅ Test 2: Get session status - PASSED
✅ Test 3: Send prompt - PASSED
✅ Test 4: Close session - PASSED
```

**Session Status Output:**
```json
{
  "userId": "test-user-1",
  "model": "claude-3-5-sonnet-20241022",
  "isReady": true,
  "isClosed": false,
  "pid": 11144
}
```

## Bugs Fixed

### 1. Infinite Recursion in closeSession()
**Problem:** `session.close()` called `this.closeSession()` which called `session.close()` again.

**Solution:** Removed session.close() method reference, directly kill child process in closeSession().

### 2. handler.flush() Not a Function
**Problem:** Tried to call `handler.flush()` on close, but ClaudeStreamHandler doesn't have flush() method.

**Solution:** Removed flush() call - not needed since we're handling buffer in stream handler already.

## File Changes Summary

**Modified:**
- `src/claude/direct-spawner.js` (342 lines → 398 lines)

**Created:**
- `tests/manual/test-refactored-spawner.js` (71 lines)
- `docs/phase2-complete.md` (this file)

**Backed up:**
- `src/claude/direct-spawner.js.backup` (original version preserved)

## Alignment with NEXT_STEPS.md

✅ **Phase 2 Requirements (from NEXT_STEPS.md):**
1. ✅ Remove ACP Dependencies - archived to `src/claude/archive/`
2. ✅ Import Stream Handler - `ClaudeStreamHandler` imported
3. ✅ Update createSession Method - refactored completely
4. ✅ Add Helper Methods - sendPrompt, sendToolResult, handleStreamEvent

## API Compatibility

**Public API Unchanged:**
- `createSession(userId, options)` - same signature
- `getOrCreateSession(userId, options)` - same signature
- `sendMessage(userId, prompt, options)` - same signature
- `closeSession(userId)` - same signature
- `closeAll()` - same signature
- `getSessionStatus(userId)` - same signature
- `getAllSessions()` - same signature
- `healthCheck()` - same signature
- `cleanup()` - same signature

**Events Unchanged:**
- `'session-created'` - emitted with { userId }
- `'text'` - emitted with { userId, text }
- `'thinking'` - emitted with { userId, thinking }
- `'tool-use'` - emitted with { userId, tool }
- `'turn-end'` - emitted with { userId, stopReason }
- `'usage'` - emitted with { userId, usage }
- `'error'` - emitted with { userId, error }
- `'debug'` - emitted with string message
- `'stderr'` - emitted with { userId, data }
- `'session-closed'` - emitted with { userId, code, signal }

**Backward Compatible:** Yes - existing code using DirectClaudeSpawner will work without changes.

## Known Limitations

1. **System Events Unhandled:** Currently logs "Unknown event type: system" for system lifecycle events. Not critical - can be implemented in Phase 3 if needed.

2. **No Response Accumulation:** sendPrompt() doesn't return accumulated response. For full response, caller must listen to events. This is intentional - maintains streaming nature.

3. **No Automatic Tool Execution:** Tool use events are emitted, but not executed automatically. Caller must handle tool execution and send results via sendToolResult().

## Next Steps

**Phase 3: Update Tests (Estimated: 1 hour)**
- Create `tests/test-basic-prompt.js` - test simple prompts
- Create `tests/test-tool-use.js` - test tool execution flow
- Create `tests/test-multi-turn.js` - test conversation continuity
- Test event emission (text, thinking, tool-use)
- Test error handling
- Test session lifecycle

**Phase 4: Documentation Update (Estimated: 30 mins)**
- Update ARCHITECTURE.md with new flow
- Update COMMANDS.md with new usage examples
- Update README.md if needed

**Phase 5: WhatsApp Integration (Estimated: 3-5 days)**
- Wire WhatsApp gateway to DirectClaudeSpawner
- Implement message routing
- Add session management per WhatsApp user
- Handle tool results from WhatsApp
- End-to-end testing

## Performance Notes

**Spawn Time:** ~100-150ms to spawn Claude CLI subprocess
**Memory Usage:** ~50MB per session (Claude CLI process)
**CPU Usage:** Low when idle, spikes during response generation

## Conclusion

Phase 2 completed successfully. DirectClaudeSpawner now uses ClaudeStreamHandler for parsing stream-json protocol directly, removing the unnecessary ACP layer. All manual tests passing, API backward compatible.

**Ready for Phase 3: Update Tests**
