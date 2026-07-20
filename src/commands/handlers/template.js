/**
 * Template Command Handlers (Phase 8)
 *
 * Handlers for template-based commands:
 * - ask: Quick question mode
 * - fix: Auto-fix errors
 * - review: Code review
 * - test: Generate unit tests
 * - doc: Generate documentation
 * - refactor: Refactoring suggestions
 */

import { readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import askTemplate from '../templates/ask.js';
import fixTemplate from '../templates/fix.js';
import reviewTemplate from '../templates/review.js';
import testTemplate from '../templates/test.js';
import docTemplate from '../templates/doc.js';
import refactorTemplate from '../templates/refactor.js';

/**
 * Extract file path from error message or user input
 * @param {string} input - Error message or user input
 * @returns {string|null} - Extracted file path or null
 * @private
 */
function extractFilePath(input) {
  // Common error patterns that include file paths
  const patterns = [
    /at\s+(.+?):(\d+):(\d+)/,           // at file.js:42:10
    /in\s+(.+?):(\d+)/,                  // in file.js:42
    /file:\/\/\/(.+)/,                   // file:///path/to/file
    /([a-zA-Z]:)?[\/\\].+?\.(js|ts|jsx|tsx|py|java|go|rs|cpp|c|h|rb|php)/, // Absolute paths
    /\.?\/[\w\/\-\.]+\.(js|ts|jsx|tsx|py|java|go|rs|cpp|c|h|rb|php)/, // Relative paths
    /src\/[\w\/\-\.]+\.(js|ts|jsx|tsx|py|java|go|rs|cpp|c|h|rb|php)/ // src/ paths
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      let path = match[1] || match[0];

      // Clean up the path
      path = path.replace(/^file:\/\/\//, '');
      path = path.trim();

      // Remove line/column numbers
      path = path.replace(/:(\d+):(\d+)$/, '');
      path = path.replace(/:(\d+)$/, '');

      return path;
    }
  }

  return null;
}

/**
 * Extract context files based on strategy
 * @param {Object} session - Active session
 * @param {string} strategy - Context strategy (none, file, directory, project)
 * @param {string} userInput - User input (may contain file path)
 * @param {string} template - Template object
 * @returns {Promise<Array>} - Array of {path, content} objects
 * @private
 */
async function extractContext(session, strategy, userInput, template) {
  const contextFiles = [];
  const maxSize = parseInt(process.env.TEMPLATE_MAX_CONTEXT_SIZE) || 512000; // 500KB default
  let totalSize = 0;

  if (strategy === 'none') {
    return contextFiles;
  }

  try {
    if (strategy === 'file') {
      // Extract file path from input
      let filePath = userInput.trim();

      // For fix command, try to extract from error message
      if (template.name === 'fix') {
        const extractedPath = extractFilePath(userInput);
        if (extractedPath) {
          filePath = extractedPath;
        }
      }

      // Clean up quotes
      filePath = filePath.replace(/^["']|["']$/g, '');

      // Check if path looks valid
      if (!filePath || filePath.length === 0) {
        return contextFiles;
      }

      // Resolve path relative to project
      let absolutePath;
      if (filePath.startsWith('/') || filePath.match(/^[a-zA-Z]:/)) {
        // Already absolute
        absolutePath = filePath;
      } else {
        // Relative to project or working directory
        const basePath = session.workingDirectory || session.projectPath;
        absolutePath = resolve(basePath, filePath);
      }

      // Read file
      try {
        const content = readFileSync(absolutePath, 'utf-8');

        if (content.length + totalSize > maxSize) {
          throw new Error(`File too large (max ${maxSize} bytes for template context)`);
        }

        contextFiles.push({ path: filePath, content });
        totalSize += content.length;

        // For test template, also try to read package.json
        if (template.name === 'test' && contextFiles.length < template.maxContextFiles) {
          try {
            const packageJsonPath = resolve(session.projectPath, 'package.json');
            const packageContent = readFileSync(packageJsonPath, 'utf-8');

            if (packageContent.length + totalSize <= maxSize) {
              contextFiles.push({ path: 'package.json', content: packageContent });
              totalSize += packageContent.length;
            }
          } catch (err) {
            // package.json not found or not readable, skip
          }
        }

        // For refactor template, try to read related files in same directory
        if (template.name === 'refactor' && contextFiles.length < template.maxContextFiles) {
          try {
            const { readdirSync, statSync } = await import('fs');
            const dir = dirname(absolutePath);
            const files = readdirSync(dir);

            for (const file of files) {
              if (contextFiles.length >= template.maxContextFiles) break;

              const fullPath = join(dir, file);
              const stat = statSync(fullPath);

              // Skip directories and the original file
              if (stat.isDirectory() || fullPath === absolutePath) continue;

              // Only include code files
              if (!file.match(/\.(js|ts|jsx|tsx|py|java|go|rs)$/)) continue;

              // Read file
              const relatedContent = readFileSync(fullPath, 'utf-8');

              if (relatedContent.length + totalSize > maxSize) break;

              contextFiles.push({
                path: join(dirname(filePath), file),
                content: relatedContent
              });
              totalSize += relatedContent.length;
            }
          } catch (err) {
            // Can't read directory, skip related files
          }
        }

      } catch (error) {
        // File not found or not readable
        // Return empty array, template will handle it
      }
    }
    // Add more strategies here in the future (directory, project)

  } catch (error) {
    // Context extraction failed, return what we have
    console.error('Context extraction error:', error.message);
  }

  return contextFiles;
}

/**
 * Build prompt from template and context
 * @param {Object} template - Template object
 * @param {string} userInput - User input
 * @param {Array} contextFiles - Context files
 * @returns {string} - Built prompt
 * @private
 */
function buildPrompt(template, userInput, contextFiles) {
  if (typeof template.userPromptTemplate === 'function') {
    return template.userPromptTemplate(userInput, contextFiles);
  }

  // Fallback: simple template string replacement
  return template.userPromptTemplate.replace('{input}', userInput);
}

/**
 * Format response based on template format
 * @param {string} response - Raw response from Claude
 * @param {string} format - Response format (markdown, code, mixed)
 * @returns {string} - Formatted response
 * @private
 */
function formatResponse(response, format) {
  // For now, pass through as-is
  // Could add formatting logic here in the future:
  // - Strip markdown for code-only
  // - Add syntax highlighting hints
  // - Chunk long responses for WhatsApp

  const maxLength = parseInt(process.env.FILE_OPS_WHATSAPP_MAX_LENGTH) || 4000;

  // If response is too long, add chunking hint
  if (response.length > maxLength) {
    const chunks = Math.ceil(response.length / maxLength);
    return response + `\n\n_Note: This response is ${response.length} characters (${chunks} WhatsApp messages)_`;
  }

  return response;
}

/**
 * Execute a template command
 * @param {Object} context - Command context
 * @param {Object} template - Template object
 * @param {string} userInput - User input
 * @returns {Promise<string>} - Response message
 * @private
 */
async function executeTemplate(context, template, userInput) {
  const { userId, sessionManager, logger } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  if (session.state !== 'PROJECT_SELECTED') {
    return '❌ No project selected. Use /project <name> first.';
  }

  try {
    // Extract context based on strategy
    logger.debug(`[Template:${template.name}] Extracting context (strategy: ${template.contextStrategy})`);
    const contextFiles = await extractContext(session, template.contextStrategy, userInput, template);

    logger.debug(`[Template:${template.name}] Extracted ${contextFiles.length} context files`);

    // Build prompt
    const userPrompt = buildPrompt(template, userInput, contextFiles);

    logger.debug(`[Template:${template.name}] Built prompt (${userPrompt.length} chars)`);

    // Send to Claude with template system prompt
    // Note: DirectClaudeSpawner doesn't support system prompt override
    // So we prepend it to the user message
    const fullPrompt = `${template.systemPrompt}\n\n---\n\n${userPrompt}`;

    logger.debug(`[Template:${template.name}] Sending to Claude...`);

    // Send message via spawner
    const spawner = session.spawner;

    // Set timeout
    const timeout = parseInt(process.env.TEMPLATE_TIMEOUT) || 60000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Template execution timeout')), timeout);
    });

    // Create response collector
    let responseText = '';
    let isComplete = false;

    const responsePromise = new Promise((resolve, reject) => {
      const onText = (data) => {
        if (data.userId === userId && data.type === 'text') {
          responseText += data.text;
        }
      };

      const onComplete = (data) => {
        if (data.userId === userId) {
          isComplete = true;
          spawner.removeListener('text', onText);
          spawner.removeListener('complete', onComplete);
          spawner.removeListener('error', onError);
          resolve(responseText);
        }
      };

      const onError = (data) => {
        if (data.userId === userId) {
          spawner.removeListener('text', onText);
          spawner.removeListener('complete', onComplete);
          spawner.removeListener('error', onError);
          reject(new Error(data.error || 'Unknown error'));
        }
      };

      spawner.on('text', onText);
      spawner.on('complete', onComplete);
      spawner.on('error', onError);
    });

    // Send the prompt
    await spawner.sendMessage(userId, fullPrompt, {
      cwd: session.workingDirectory || session.projectPath,
      model: session.model || 'claude-3-5-sonnet-20241022'
    });

    // Wait for response or timeout
    const response = await Promise.race([responsePromise, timeoutPromise]);

    // Format response
    const formatted = formatResponse(response, template.responseFormat);

    logger.debug(`[Template:${template.name}] Complete (${formatted.length} chars)`);

    return formatted;

  } catch (error) {
    logger.error(`[Template:${template.name}] Execution failed:`, error.message);
    return `❌ Template execution failed: ${error.message}`;
  }
}

/**
 * /ask - Quick question mode
 */
export async function ask(context) {
  const { args } = context;

  if (args.length === 0) {
    return '❌ *Usage:* /ask <question>\n\n' +
           '*Description:* Get a quick, focused answer to your question.\n\n' +
           '*Example:*\n' +
           '  /ask how to handle async errors in node.js\n' +
           '  /ask what is the difference between let and const';
  }

  const question = args.join(' ');
  return executeTemplate(context, askTemplate, question);
}

/**
 * /fix - Auto-fix error message
 */
export async function fix(context) {
  const { args } = context;

  if (args.length === 0) {
    return '❌ *Usage:* /fix <error message>\n\n' +
           '*Description:* Analyze an error and get a fix.\n\n' +
           '*Example:*\n' +
           '  /fix TypeError: Cannot read property "map" of undefined\n' +
           '  /fix SyntaxError: Unexpected token } at app.js:42';
  }

  const errorMessage = args.join(' ');
  return executeTemplate(context, fixTemplate, errorMessage);
}

/**
 * /review - Code review with best practices
 */
export async function review(context) {
  const { args } = context;

  if (args.length === 0) {
    return '❌ *Usage:* /review <file>\n\n' +
           '*Description:* Get a comprehensive code review.\n\n' +
           '*Example:*\n' +
           '  /review src/auth/login.js\n' +
           '  /review src/utils/validator.ts';
  }

  const filePath = args.join(' ');
  return executeTemplate(context, reviewTemplate, filePath);
}

/**
 * /test - Generate unit tests
 */
export async function test(context) {
  const { args } = context;

  if (args.length === 0) {
    return '❌ *Usage:* /test <file>\n\n' +
           '*Description:* Generate comprehensive unit tests.\n\n' +
           '*Example:*\n' +
           '  /test src/utils/validator.js\n' +
           '  /test src/services/auth.ts';
  }

  const filePath = args.join(' ');
  return executeTemplate(context, testTemplate, filePath);
}

/**
 * /doc - Generate documentation
 */
export async function doc(context) {
  const { args } = context;

  if (args.length === 0) {
    return '❌ *Usage:* /doc <file>\n\n' +
           '*Description:* Generate comprehensive documentation.\n\n' +
           '*Example:*\n' +
           '  /doc src/api/users.js\n' +
           '  /doc src/utils/helpers.ts';
  }

  const filePath = args.join(' ');
  return executeTemplate(context, docTemplate, filePath);
}

/**
 * /refactor - Refactoring suggestions
 */
export async function refactor(context) {
  const { args } = context;

  if (args.length === 0) {
    return '❌ *Usage:* /refactor <file>\n\n' +
           '*Description:* Get refactoring suggestions with examples.\n\n' +
           '*Example:*\n' +
           '  /refactor src/services/payment.js\n' +
           '  /refactor src/components/UserList.tsx';
  }

  const filePath = args.join(' ');
  return executeTemplate(context, refactorTemplate, filePath);
}

export default {
  ask,
  fix,
  review,
  test,
  doc,
  refactor
};
