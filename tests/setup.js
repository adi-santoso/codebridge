/**
 * Jest Setup File
 * Global test utilities and configurations
 */

// Global test helpers
global.waitFor = async (condition, timeout = 5000, interval = 100) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
};
