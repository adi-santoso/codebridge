#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Python Spawn Test - Verify Claude CLI works in Python subprocess

Based on GitHub #771 report that Python subprocess works
"""

import subprocess
import sys
import time
from threading import Thread, Event

# Fix Windows console encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("[TEST] Python Spawn Test - Claude CLI\n")

# Test 1: Basic version check
print("=" * 50)
print("Test 1: Basic Version Check")
print("=" * 50)

try:
    result = subprocess.run(
        ['claude', '--version'],
        capture_output=True,
        text=True,
        timeout=5
    )

    print(f"Exit code: {result.returncode}")
    print(f"STDOUT: {result.stdout.strip()}")
    print(f"STDERR: {result.stderr.strip()}")

    if result.returncode == 0:
        print("[PASS] Test 1 PASS: Version command works\n")
    else:
        print("[FAIL] Test 1 FAIL: Non-zero exit code\n")

except subprocess.TimeoutExpired:
    print("[FAIL] Test 1 FAIL: Timeout\n")
except FileNotFoundError:
    print("[FAIL] Test 1 FAIL: Claude CLI not found in PATH\n")
    sys.exit(1)
except Exception as e:
    print(f"[FAIL] Test 1 FAIL: {e}\n")
    sys.exit(1)

# Test 2: Interactive subprocess with stdin/stdout
print("=" * 50)
print("Test 2: Interactive Subprocess")
print("=" * 50)

test_dir = "D:/working/gatrion/codebridge/tests/test-project"

try:
    # Spawn Claude process
    print(f"Spawning Claude in: {test_dir}")
    print("Command: claude --dangerously-skip-permissions --output-format stream-json\n")

    process = subprocess.Popen(
        ['claude', '--dangerously-skip-permissions', '--output-format', 'stream-json'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=test_dir
    )

    print(f"Process PID: {process.pid}")

    # Track if we received output
    received_output = Event()
    output_buffer = []

    def read_stdout():
        """Read stdout in background thread"""
        try:
            for line in process.stdout:
                output_buffer.append(('stdout', line))
                print(f"[OUT] STDOUT: {line.strip()}")
                received_output.set()
        except Exception as e:
            print(f"stdout reader error: {e}")

    def read_stderr():
        """Read stderr in background thread"""
        try:
            for line in process.stderr:
                output_buffer.append(('stderr', line))
                print(f"[ERR] STDERR: {line.strip()}")
        except Exception as e:
            print(f"stderr reader error: {e}")

    # Start reader threads
    stdout_thread = Thread(target=read_stdout, daemon=True)
    stderr_thread = Thread(target=read_stderr, daemon=True)

    stdout_thread.start()
    stderr_thread.start()

    # Wait a bit for initialization
    print("\nWaiting 3 seconds for Claude to initialize...")
    time.sleep(3)

    # Send test command
    test_command = "echo Hello from Python test\n"
    print(f"\n[SEND] Sending command: {test_command.strip()}")
    process.stdin.write(test_command)
    process.stdin.flush()

    # Wait for response
    print("Waiting 5 seconds for response...")
    received_output.wait(timeout=5)

    # Send exit command
    print("\n[SEND] Sending exit command")
    process.stdin.write("/exit\n")
    process.stdin.flush()

    # Wait for process to finish
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        print("[WARN] Process didn't exit cleanly, killing...")
        process.kill()
        process.wait()

    # Analyze results
    print("\n" + "=" * 50)
    print("Test 2 Results")
    print("=" * 50)
    print(f"Exit code: {process.returncode}")
    print(f"Received output: {received_output.is_set()}")
    print(f"Output lines: {len(output_buffer)}")

    if received_output.is_set():
        print("\n[PASS] Test 2 PASS: Claude responded to stdin!")
        print("[PASS] Python subprocess is VIABLE for CodeBridge")

        # Show sample output
        if output_buffer:
            print("\nSample output:")
            for stream, line in output_buffer[:5]:
                print(f"  [{stream}] {line.strip()}")
    else:
        print("\n[FAIL] Test 2 FAIL: No response from Claude")
        print("[WARN] This is unexpected - Python should work per GitHub #771")

except Exception as e:
    print(f"\n[FAIL] Test 2 FAIL: Exception occurred")
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 50)
print("Python Validation Complete")
print("=" * 50)
