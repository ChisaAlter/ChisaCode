#!/usr/bin/env node
/**
 * Migration script: npm workspaces → pnpm + catalog
 *
 * Usage: node scripts/migrate-to-pnpm.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const WORKSPACE_PACKAGES = [
  'packages/expo-two-way-audio',
  'packages/highlight',
  'packages/protocol',
  'packages/client',
  'packages/server',
  'packages/app',
  'packages/relay',
  'packages/desktop',
  'packages/cli',
]

const CATALOG_DEPS = {
  react: '19.2.3',
  'react-dom': '19.2.3',
  'react-native': '0.86.0',
  typescript: '^5.9.3',
  '@types/node': '^22.10.0',
  vitest: '^4.1.10',
  zod: '^4.3.6',
  ws: '8.21.0',
  expo: '~57.0.0',
  'expo-router': '~57.0.0',
}

function updatePackageJson(pkgPath) {
  const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  let changed = false

  // Convert catalog-compatible deps
  for (const depType of ['dependencies', 'devDependencies']) {
    if (!content[depType]) continue

    for (const [name, version] of Object.entries(content[depType])) {
      if (CATALOG_DEPS[name]) {
        content[depType][name] = 'catalog:'
        changed = true
        console.log(`  ✓ ${name}: ${version} → catalog:`)
      }
    }
  }

  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(content, null, 2) + '\n')
    console.log(`✅ Updated ${pkgPath}`)
  }
}

console.log('🚀 Starting pnpm migration...\n')

// Step 1: Update workspace package.json files
console.log('📦 Step 1: Updating package.json files...')
for (const pkg of WORKSPACE_PACKAGES) {
  const pkgPath = path.join(process.cwd(), pkg, 'package.json')
  if (fs.existsSync(pkgPath)) {
    console.log(`\n📝 Processing ${pkg}...`)
    updatePackageJson(pkgPath)
  }
}

// Step 2: Update root package.json
console.log('\n📝 Updating root package.json...')
updatePackageJson(path.join(process.cwd(), 'package.json'))

console.log('\n✅ Migration complete!')
console.log('\n📌 Next steps:')
console.log('1. Install pnpm: npm install -g pnpm@latest')
console.log('2. Remove old dependencies: rm -rf node_modules package-lock.json')
console.log('3. Install with pnpm: pnpm install')
console.log('4. Verify build: pnpm run build')
console.log('5. Run tests: pnpm run test:guard')
