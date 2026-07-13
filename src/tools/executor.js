import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve, relative } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

/**
 * ToolExecutor - Executes Claude tools (Bash, Read, Write, Edit) with sandboxing
 *
 * @class ToolExecutor
 * @example
 * const executor = new ToolExecutor({ projectPath: '/path/to/project' });
 * const result = await executor.execute({ name: 'Bash', input: { command: 'ls -la' } });
 */
export class ToolExecutor {
  /**
   * Create a ToolExecutor instance
   * @param {Object} options
   * @param {string} options.projectPath - Project directory path (for sandboxing)
   * @param {number} [options.timeout=30000] - Command timeout in milliseconds
   */
  constructor(options = {}) {
    this.projectPath = resolve(options.projectPath || process.cwd());
    this.timeout = options.timeout || 30000; // 30 seconds default
  }

  /**
   * Execute a tool
   * @param {Object} tool - Tool object from Claude
   * @param {string} tool.name - Tool name (Bash, Read, Write, Edit)
   * @param {Object} tool.input - Tool input parameters
   * @returns {Promise<{content: string, isError: boolean}>}
   */
  async execute(tool) {
    const { name, input } = tool;

    try {
      switch (name) {
        case 'Bash':
          return await this.executeBash(input);

        case 'Read':
          return await this.executeRead(input);

        case 'Write':
          return await this.executeWrite(input);

        case 'Edit':
          return await this.executeEdit(input);

        default:
          return {
            content: `Unknown tool: ${name}`,
            isError: true
          };
      }
    } catch (error) {
      return {
        content: `Tool execution error: ${error.message}`,
        isError: true
      };
    }
  }

  /**
   * Execute Bash command
   * @private
   */
  async executeBash(input) {
    const { command } = input;

    if (!command) {
      return {
        content: 'Error: No command provided',
        isError: true
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env }
      });

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');

      return {
        content: output || '(Command executed successfully with no output)',
        isError: false
      };
    } catch (error) {
      // If timeout
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          content: `Command timed out after ${this.timeout}ms`,
          isError: true
        };
      }

      // If command failed (non-zero exit code)
      return {
        content: `Command failed (exit code ${error.code}):\n${error.stdout || ''}${error.stderr ? '\nSTDERR:\n' + error.stderr : ''}`,
        isError: true
      };
    }
  }

  /**
   * Execute Read file operation
   * @private
   */
  async executeRead(input) {
    const { file_path } = input;

    if (!file_path) {
      return {
        content: 'Error: No file_path provided',
        isError: true
      };
    }

    // Resolve and validate path
    const fullPath = this.resolvePath(file_path);
    const validationError = this.validatePath(fullPath);
    if (validationError) {
      return {
        content: validationError,
        isError: true
      };
    }

    try {
      const content = await readFile(fullPath, 'utf-8');
      return {
        content,
        isError: false
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          content: `File not found: ${file_path}`,
          isError: true
        };
      }
      return {
        content: `Failed to read file: ${error.message}`,
        isError: true
      };
    }
  }

  /**
   * Execute Write file operation
   * @private
   */
  async executeWrite(input) {
    const { file_path, content } = input;

    if (!file_path) {
      return {
        content: 'Error: No file_path provided',
        isError: true
      };
    }

    if (content === undefined) {
      return {
        content: 'Error: No content provided',
        isError: true
      };
    }

    // Resolve and validate path
    const fullPath = this.resolvePath(file_path);
    const validationError = this.validatePath(fullPath);
    if (validationError) {
      return {
        content: validationError,
        isError: true
      };
    }

    try {
      // Ensure directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(fullPath, content, 'utf-8');
      return {
        content: `Successfully wrote to ${file_path}`,
        isError: false
      };
    } catch (error) {
      return {
        content: `Failed to write file: ${error.message}`,
        isError: true
      };
    }
  }

  /**
   * Execute Edit file operation
   * @private
   */
  async executeEdit(input) {
    const { file_path, old_string, new_string } = input;

    if (!file_path) {
      return {
        content: 'Error: No file_path provided',
        isError: true
      };
    }

    if (!old_string) {
      return {
        content: 'Error: No old_string provided',
        isError: true
      };
    }

    if (new_string === undefined) {
      return {
        content: 'Error: No new_string provided',
        isError: true
      };
    }

    // Resolve and validate path
    const fullPath = this.resolvePath(file_path);
    const validationError = this.validatePath(fullPath);
    if (validationError) {
      return {
        content: validationError,
        isError: true
      };
    }

    try {
      // Read file
      let content = await readFile(fullPath, 'utf-8');

      // Check if old_string exists
      if (!content.includes(old_string)) {
        return {
          content: `Error: String not found in file:\n${old_string}`,
          isError: true
        };
      }

      // Replace
      const occurrences = (content.match(new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

      if (occurrences > 1) {
        return {
          content: `Error: String appears ${occurrences} times in file. Please provide a more specific string.`,
          isError: true
        };
      }

      content = content.replace(old_string, new_string);

      // Write back
      await writeFile(fullPath, content, 'utf-8');

      return {
        content: `Successfully edited ${file_path}`,
        isError: false
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          content: `File not found: ${file_path}`,
          isError: true
        };
      }
      return {
        content: `Failed to edit file: ${error.message}`,
        isError: true
      };
    }
  }

  /**
   * Resolve file path relative to project directory
   * @private
   */
  resolvePath(filePath) {
    // If absolute path, use as-is
    if (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)) {
      return resolve(filePath);
    }
    // Otherwise resolve relative to project
    return resolve(this.projectPath, filePath);
  }

  /**
   * Validate that path is within project directory (sandboxing)
   * @private
   * @returns {string|null} Error message if invalid, null if valid
   */
  validatePath(fullPath) {
    const normalized = resolve(fullPath);
    const relativePath = relative(this.projectPath, normalized);

    // Check if path escapes project directory
    if (relativePath.startsWith('..') || resolve(relativePath) === relativePath) {
      return `Error: Path outside project directory not allowed: ${fullPath}`;
    }

    return null;
  }

  /**
   * Get current project path
   * @returns {string}
   */
  getProjectPath() {
    return this.projectPath;
  }

  /**
   * Set new project path
   * @param {string} path
   */
  setProjectPath(path) {
    this.projectPath = resolve(path);
  }
}

export default ToolExecutor;
