import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * Two projects: the data layer runs in Node on PouchDB's memory adapter, the UI components run in
 * real Chromium through Playwright because Web Awesome and SortableJS need a real DOM.
 *
 * `PLAYWRIGHT_CHROMIUM` points at an existing Chromium when the Playwright-managed one is not
 * installed (for instance in a container that ships its own); CI installs the managed one.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/data/**/*.test.ts'],
        },
      },
      {
        // Pre-bundled up front, so Vite does not reload the page mid-test when it discovers it.
        optimizeDeps: { include: ['pouchdb-browser'] },
        test: {
          name: 'browser',
          include: ['test/ui/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: executablePath ? { executablePath } : {} }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
