#!/usr/bin/env node
/**
 * Bundle Size Checker
 *
 * Verifies built artifacts don't exceed size budgets.
 * Fails CI if budgets are violated.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --fail-on-increase
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE_BUDGETS } from './bundle-budgets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getDirectorySize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0

  let total = 0
  const files = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      total += getDirectorySize(filePath)
    } else {
      total += fs.statSync(filePath).size
    }
  }

  return total
}

function checkBundles() {
  console.log('📦 Checking bundle sizes...\n')

  const violations = []

  // Check desktop bundles
  console.log('🖥️  Desktop App')
  const desktopDist = path.join(ROOT, 'packages/desktop/dist')
  if (fs.existsSync(desktopDist)) {
    for (const [file, budget] of Object.entries(BUNDLE_BUDGETS.desktop)) {
      const filePath = path.join(desktopDist, file)
      if (fs.existsSync(filePath)) {
        const size = fs.statSync(filePath).size
        const status = size <= budget ? '✓' : '✗'
        const color = size <= budget ? '' : '\x1b[31m'
        const reset = '\x1b[0m'

        console.log(
          `  ${status} ${file}: ${color}${formatBytes(size)}${reset} / ${formatBytes(budget)}`
        )

        if (size > budget) {
          violations.push({
            file,
            size,
            budget,
            overage: size - budget,
          })
        }
      }
    }
  } else {
    console.log('  ⚠️  Not built yet')
  }

  // Check node_modules sizes
  console.log('\n📦 Dependencies')
  for (const [pkg, budget] of Object.entries(BUNDLE_BUDGETS.dependencies)) {
    const nodeModules = path.join(ROOT, 'packages', pkg, 'node_modules')
    if (fs.existsSync(nodeModules)) {
      const size = getDirectorySize(nodeModules)
      const status = size <= budget ? '✓' : '✗'
      const color = size <= budget ? '' : '\x1b[31m'
      const reset = '\x1b[0m'

      console.log(
        `  ${status} ${pkg}: ${color}${formatBytes(size)}${reset} / ${formatBytes(budget)}`
      )

      if (size > budget) {
        violations.push({
          file: `${pkg}/node_modules`,
          size,
          budget,
          overage: size - budget,
        })
      }
    }
  }

  // Report violations
  if (violations.length > 0) {
    console.log('\n❌ Bundle size budget violations:\n')
    for (const v of violations) {
      console.log(
        `  ${v.file}: ${formatBytes(v.size)} exceeds budget by ${formatBytes(v.overage)}`
      )
    }
    console.log('\n💡 Consider:')
    console.log('  - Code splitting / lazy loading')
    console.log('  - Removing unused dependencies')
    console.log('  - Using lighter alternatives')
    console.log('  - Tree-shaking improvements')
    console.log('\nSee scripts/bundle-budgets.mjs for suggestions.')

    process.exit(1)
  }

  console.log('\n✅ All bundles within budget!')
}

// Find largest dependencies
function analyzeDependencies() {
  console.log('\n\n📊 Largest Dependencies:\n')

  const nodeModules = path.join(ROOT, 'node_modules')
  if (!fs.existsSync(nodeModules)) {
    console.log('Run pnpm install first')
    return
  }

  const packages = fs
    .readdirSync(nodeModules, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const pkgPath = path.join(nodeModules, d.name)
      const size = getDirectorySize(pkgPath)
      return { name: d.name, size }
    })
    .filter((p) => p.size > 1024 * 1024) // > 1 MB
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)

  for (const pkg of packages) {
    console.log(`  ${pkg.name.padEnd(40)} ${formatBytes(pkg.size)}`)
  }
}

// Run checks
checkBundles()

if (process.argv.includes('--analyze')) {
  analyzeDependencies()
}
