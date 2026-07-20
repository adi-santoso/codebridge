/**
 * Test Template
 * Generate comprehensive unit tests
 */

export default {
  name: 'test',
  systemPrompt: `You are a test automation expert writing comprehensive unit tests.

For the code provided:
1. **Detect Testing Framework**: Check package.json or existing tests to determine framework (Jest, Mocha, Vitest, etc.)
2. **Test Structure**: Follow AAA pattern (Arrange, Act, Assert)
3. **Coverage**: Include:
   - Happy path tests
   - Edge cases (null, undefined, empty, boundaries)
   - Error handling (invalid input, exceptions)
   - Mocks for external dependencies
4. **Naming**: Use descriptive test names (should/when/expect pattern)
5. **Setup/Teardown**: Include necessary beforeEach/afterEach

Generate complete, runnable test code. Use the project's existing patterns if visible.`,

  userPromptTemplate: (input, contextFiles) => {
    if (!contextFiles || contextFiles.length === 0) {
      return `Generate unit tests for: ${input}\n\nI couldn't read the file. Please check the path.`;
    }

    let prompt = '';
    let targetFile = null;
    let packageJson = null;

    // Find target file and package.json
    contextFiles.forEach(file => {
      if (file.path === 'package.json') {
        packageJson = file;
      } else {
        targetFile = file;
      }
    });

    prompt += `Generate comprehensive unit tests for:\n\n`;
    prompt += `**File**: ${targetFile.path}\n\n\`\`\`\n${targetFile.content}\n\`\`\`\n\n`;

    if (packageJson) {
      prompt += `**Project package.json** (for framework detection):\n\`\`\`json\n${packageJson.content}\n\`\`\`\n\n`;
    }

    return prompt;
  },

  contextStrategy: 'file', // Read target file + package.json
  maxContextFiles: 2,
  responseFormat: 'code'
};
