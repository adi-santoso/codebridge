/**
 * Doc Template
 * Generate comprehensive documentation
 */

export default {
  name: 'doc',
  systemPrompt: `You are a technical documentation expert.

Generate documentation that includes:
1. **Purpose & Overview**: What this code does and why it exists
2. **API Documentation**:
   - For functions: parameters, return values, exceptions
   - For classes: constructor, methods, properties
   - Use appropriate format (JSDoc for JS/TS, docstrings for Python, etc.)
3. **Usage Examples**: Practical examples showing how to use it
4. **Edge Cases & Limitations**: What to watch out for
5. **Dependencies**: What this code depends on

Format:
- Use the language's standard documentation format
- Include type information where applicable
- Write examples that can be copy-pasted
- Be thorough but not verbose

Generate documentation that helps developers use the code confidently.`,

  userPromptTemplate: (input, contextFiles) => {
    if (!contextFiles || contextFiles.length === 0) {
      return `Generate documentation for: ${input}\n\nI couldn't read the file. Please check the path.`;
    }

    const file = contextFiles[0];
    return `Generate comprehensive documentation for:\n\n**File**: ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\``;
  },

  contextStrategy: 'file', // Read the target file
  maxContextFiles: 1,
  responseFormat: 'mixed' // Documentation + code examples
};
