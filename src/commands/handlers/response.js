/**
 * Response Control Command Handlers - Phase 4
 *
 * Commands for controlling Claude's response mode:
 * - /brief - Concise, minimal explanation mode
 * - /balanced - Default mode (moderate detail)
 * - /detailed - Comprehensive, verbose mode
 * - /code-only - Only code without explanation
 * - /explain-only - Only explanation without code
 */

/**
 * Set response mode to brief
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function brief(context) {
  const { userId, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  // Save to database
  db.setUserPreference(userId, 'responseMode', 'brief');

  // Update active session
  sessionManager.setResponseMode(userId, 'brief');

  return `✅ *Response Mode: Brief*

Responses will now be concise and direct.
- Minimal explanations
- Bullet points preferred
- Max 3 sentences unless code involved

Use \`/balanced\` to restore default mode.`;
}

/**
 * Set response mode to balanced (default)
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function balanced(context) {
  const { userId, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  // Save to database
  db.setUserPreference(userId, 'responseMode', 'balanced');

  // Update active session
  sessionManager.setResponseMode(userId, 'balanced');

  return `✅ *Response Mode: Balanced*

Responses restored to default mode.
- Moderate detail
- Clear explanations
- Code with context

This is the recommended mode for most use cases.`;
}

/**
 * Set response mode to detailed
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function detailed(context) {
  const { userId, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  // Save to database
  db.setUserPreference(userId, 'responseMode', 'detailed');

  // Update active session
  sessionManager.setResponseMode(userId, 'detailed');

  return `✅ *Response Mode: Detailed*

Responses will now be comprehensive and thorough.
- Detailed explanations
- Step-by-step breakdowns
- Context and examples
- Edge case considerations

⚠️ Note: Responses may be longer. Use \`/balanced\` for normal mode.`;
}

/**
 * Set response mode to code-only
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function codeOnly(context) {
  const { userId, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  // Check if allowed
  const allowed = process.env.RESPONSE_ALLOW_CODE_ONLY !== 'false';
  if (!allowed) {
    return '❌ Code-only mode is disabled by administrator.';
  }

  // Save to database
  db.setUserPreference(userId, 'responseMode', 'code-only');

  // Update active session
  sessionManager.setResponseMode(userId, 'code-only');

  return `✅ *Response Mode: Code Only*

Responses will contain only code.
- No explanations or commentary
- Pure code blocks
- File paths as comments

⚠️ Use \`/explain-only\` if you need explanations.
Use \`/balanced\` to restore normal mode.`;
}

/**
 * Set response mode to explain-only
 * @param {Object} context - Command context
 * @returns {Promise<string>} Response message
 */
export async function explainOnly(context) {
  const { userId, sessionManager, db } = context;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    return '❌ No active session. Use /newsession to create one.';
  }

  // Check if allowed
  const allowed = process.env.RESPONSE_ALLOW_EXPLAIN_ONLY !== 'false';
  if (!allowed) {
    return '❌ Explain-only mode is disabled by administrator.';
  }

  // Save to database
  db.setUserPreference(userId, 'responseMode', 'explain-only');

  // Update active session
  sessionManager.setResponseMode(userId, 'explain-only');

  return `✅ *Response Mode: Explain Only*

Responses will explain without code.
- Conceptual explanations
- Pseudocode or descriptions
- Focus on 'why' and 'how'
- No actual code implementation

⚠️ Use \`/code-only\` if you need code.
Use \`/balanced\` to restore normal mode.`;
}
