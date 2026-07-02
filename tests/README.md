# Phase 0 Validation Tests

## Overview

3 tests untuk validasi apakah Claude CLI bisa di-spawn dari Node.js.

## Test Files

### Test 1: Basic Spawn (`test-1-basic-spawn.js`)
- Test paling sederhana: `claude --version`
- Cek apakah command bisa dijalankan
- Timeout: 10 detik

**Run:**
```bash
node tests/test-1-basic-spawn.js
```

---

### Test 2: Interactive Mode (`test-2-interactive-spawn.js`)
- Spawn Claude dalam mode interactive
- Kirim command via stdin
- Test persistent session
- Timeout: 15 detik

**Run:**
```bash
node tests/test-2-interactive-spawn.js
```

---

### Test 3: One-Shot Command (`test-3-oneshot-spawn.js`)
- Test seperti yang di-report di GitHub #771
- Satu command langsung selesai
- Paling mungkin hang berdasarkan issue
- Timeout: 30 detik

**Run:**
```bash
node tests/test-3-oneshot-spawn.js
```

---

## Expected Results

### ✅ Best Case
Semua test pass → Node.js subprocess works → Continue dengan arsitektur original

### ⚠️ Partial Success
- Test 1 pass, Test 2-3 fail → Basic spawn works, but interactive doesn't
- Test 1-2 pass, Test 3 fail → Interactive might work as workaround

### ❌ Worst Case
Semua test fail/timeout → Python bridge needed

---

## Run All Tests

```bash
# Sequential
node tests/test-1-basic-spawn.js
node tests/test-2-interactive-spawn.js
node tests/test-3-oneshot-spawn.js

# Or create test runner
node tests/run-all-tests.js
```

---

## Decision Matrix

| Test 1 | Test 2 | Test 3 | Decision |
|--------|--------|--------|----------|
| ✅ | ✅ | ✅ | Perfect! Continue Node.js |
| ✅ | ✅ | ❌ | Use interactive mode |
| ✅ | ❌ | ❌ | Python bridge needed |
| ❌ | ❌ | ❌ | Check Claude CLI installation |

---

## Notes

- Semua test punya timeout untuk detect hanging
- Output di-capture untuk debugging
- Test 2 buat test-project directory otomatis
- Jika hang, process di-kill paksa

---

## Next Steps

Setelah testing:

1. **If Node.js works:** Continue ke Phase 1 (MCP Core)
2. **If Node.js fails:** Build Python bridge (Priority 2)
3. Document hasil test untuk reference
