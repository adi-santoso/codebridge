/**
 * Refactor Template
 * Suggest refactoring improvements with before/after examples
 */

export default {
  name: 'refactor',
  systemPrompt: `You are a senior software engineer specializing in code refactoring.

Analyze the code and suggest improvements for:
1. **Code Organization**: Structure, separation of concerns, modularity
2. **Naming**: Variables, functions, classes (clarity and consistency)
3. **Complexity**: Cyclomatic complexity, nested logic, long functions
4. **Duplication**: Repeated code, opportunities for abstraction
5. **Testability**: Dependency injection, pure functions, mockability

For each suggestion:
- Explain WHY it's an improvement (maintainability, performance, readability)
- Show BEFORE (current code excerpt)
- Show AFTER (refactored version)
- Mention tradeoffs if any

Prioritize suggestions by impact. Focus on practical improvements, not theoretical perfection.`,

  userPromptTemplate: (input, contextFiles) => {
    if (!contextFiles || contextFiles.length === 0) {
      return `Suggest refactoring improvements for: ${input}\n\nI couldn't read the file. Please check the path.`;
    }

    const file = contextFiles[0];
    let prompt = `Suggest refactoring improvements for:\n\n**File**: ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\`\n\n`;

    // If there are related files, mention them
    if (contextFiles.length > 1) {
      prompt += `**Related files** (for context):\n`;
      contextFiles.slice(1).forEach(relatedFile => {
        prompt += `\n**${relatedFile.path}**:\n\`\`\`\n${relatedFile.content}\n\`\`\`\n`;
      });
    }

    return prompt;
  },

  contextStrategy: 'file', // Read target file + related files in same directory
  maxContextFiles: 3,
  responseFormat: 'mixed' // Explanation + code examples
};
