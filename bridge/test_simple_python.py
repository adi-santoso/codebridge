#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple Python Test - Like GitHub #771 example
"""

import subprocess
import sys

# Fix Windows console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("[TEST] Simple Claude Subprocess Test (like GitHub #771)\n")

# Test exactly like the issue report
test_dir = "D:/working/gatrion/codebridge/tests/test-project"

print("Command: claude 'list files in this directory'")
print(f"Working dir: {test_dir}\n")

try:
    result = subprocess.run(
        ['claude', 'list files in this directory'],
        cwd=test_dir,
        capture_output=True,
        text=True,
        timeout=30
    )

    print("=" * 50)
    print("RESULTS")
    print("=" * 50)
    print(f"Exit code: {result.returncode}\n")

    if result.stdout:
        print("STDOUT:")
        print(result.stdout)

    if result.stderr:
        print("\nSTDERR:")
        print(result.stderr)

    if result.returncode == 0 and result.stdout:
        print("\n[PASS] Python subprocess WORKS!")
        print("This confirms GitHub #771 - Python is viable")
    else:
        print("\n[INFO] Exit code non-zero or no output")
        print("This might be normal for Claude CLI behavior")

except subprocess.TimeoutExpired:
    print("[FAIL] TIMEOUT after 30 seconds")
    print("Claude hung in Python too - unexpected!")
except Exception as e:
    print(f"[FAIL] Error: {e}")

print("\n" + "=" * 50)
