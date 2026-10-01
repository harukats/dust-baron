import { defineConfig } from 'vitest/config';
import type { Reporter } from 'vitest/node';

const requireExecutedTests: Reporter = {
  onTestRunEnd(modules) {
    const executed = modules.reduce((count, module) => {
      for (const test of module.children.allTests()) {
        if (test.result().state === 'passed' || test.result().state === 'failed') count++;
      }
      return count;
    }, 0);

    if (executed === 0) {
      process.stderr.write('No tests were executed. Check the test file and name filters.\n');
      process.exitCode = 1;
    }
  },
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default', requireExecutedTests],
  },
});
