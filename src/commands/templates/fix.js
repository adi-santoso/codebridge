/**
 * Fix Template
 * Auto-fix error messages with root cause analysis
 */

export default {
  name: 'fix',
  systemPrompt: `You are a debugging assistant helping fix errors.

When analyzing errors:
1. **Root Cause**: Explain what's actually wrong (not just symptoms)
2. **Fix**: Provide specific solution with code if applicable
3. **Prevention**: Brief tip to avoid this in future

Be direct and solution-focused. If you see a file path in the error, I'll provide that file's content.`,

  userPromptTemplate: (input, contextFiles) => {
    let prompt = `Help me fix this error:\n\n\`\`\`\n${input}\n\`\`\``;

    if (contextFiles && contextFiles.length > 0) {
      prompt += `\n\nRelevant file content:\n\n`;
      contextFiles.forEach(file => {
        prompt += `**${file.path}**:\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      });
    }

    return prompt;
  },

  contextStrategy: 'file', // Read file if mentioned in error
  maxContextFiles: 2,
  responseFormat: 'mixed'
};
