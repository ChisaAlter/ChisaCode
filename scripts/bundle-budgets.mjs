/**
 * Bundle Size Budget Configuration
 *
 * Prevents accidental bundle bloat by failing builds that exceed limits.
 * Inspired by T3code's lean codebase approach (341 MB vs our 3.2 GB).
 *
 * Usage:
 * - Add to CI/CD pipeline
 * - Run locally: node scripts/check-bundle-size.mjs
 * - Update budgets as needed (but justify increases!)
 */

export const BUNDLE_BUDGETS = {
  // Desktop app (Electron)
  desktop: {
    'main.js': 500_000, // 500 KB - Electron main process
    'renderer.js': 2_000_000, // 2 MB - React app bundle
    'preload.js': 100_000, // 100 KB - Preload script
  },

  // Mobile app (React Native)
  mobile: {
    'index.android.bundle': 3_000_000, // 3 MB - Android JS bundle
    'index.ios.bundle': 3_000_000, // 3 MB - iOS JS bundle
  },

  // Web app
  web: {
    'main.js': 1_500_000, // 1.5 MB - Initial load
    'vendor.js': 1_000_000, // 1 MB - Third-party libs
  },

  // Server
  server: {
    'index.js': 500_000, // 500 KB - Server entry
  },

  // Total node_modules size limits (per package)
  dependencies: {
    app: 200_000_000, // 200 MB
    desktop: 150_000_000, // 150 MB
    server: 100_000_000, // 100 MB
    cli: 50_000_000, // 50 MB
    protocol: 10_000_000, // 10 MB
    client: 20_000_000, // 20 MB
  },
}

/**
 * Heavy dependencies to audit/replace
 *
 * These packages are known bundle bloaters.
 * Consider lighter alternatives or lazy loading.
 */
export const HEAVY_DEPENDENCIES_WATCHLIST = [
  // Consider replacing with lighter alternatives
  { name: 'moment', size: '~230 KB', alternative: 'date-fns (tree-shakeable)' },
  { name: 'lodash', size: '~70 KB', alternative: 'lodash-es (tree-shakeable)' },
  { name: 'axios', size: '~15 KB', alternative: 'native fetch' },
  { name: 'rxjs', size: '~160 KB', alternative: 'Event emitters for simple cases' },

  // Consider lazy loading
  { name: 'monaco-editor', size: '~3 MB', note: 'Lazy load in code editor' },
  { name: 'pdfjs-dist', size: '~2 MB', note: 'Lazy load for PDF preview' },
  { name: 'chart.js', size: '~200 KB', note: 'Lazy load for analytics' },

  // Already heavy, ensure they're necessary
  { name: 'xterm', size: '~600 KB', note: 'Required for terminal' },
  { name: '@anthropic-ai/*', note: 'Provider dependencies - keep' },
]

/**
 * Tree-shaking checklist
 *
 * Ensure these are properly tree-shakeable:
 */
export const TREE_SHAKING_CHECKLIST = [
  '✓ Use named imports: import { foo } from "lib" (not import * as lib)',
  '✓ Set "sideEffects": false in package.json',
  '✓ Use ES modules (not CommonJS)',
  '✓ Avoid barrel exports (export * from) in hot paths',
  '✓ Mark CSS imports as side effects',
  '✓ Use dynamic imports for heavy components',
]
