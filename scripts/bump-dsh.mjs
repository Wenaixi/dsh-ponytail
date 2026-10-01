#!/usr/bin/env node
// scripts/bump-dsh.mjs — DSH 后缀版本递增（每个版本都带 -dsh.N）
// 约定：初始即 4.10.0-dsh.0，上游未发版时递增 N（如 4.10.0-dsh.0 -> 4.10.0-dsh.1）
// 上游发新版时：node scripts/bump-dsh.mjs 4.10.0 -> 4.10.0-dsh.0
// 用法：node scripts/bump-dsh.mjs              -> 递增当前版本的 N
//      node scripts/bump-dsh.mjs 4.10.0       -> 上游新版 4.10.0，产出 4.10.0-dsh.0
//      node scripts/bump-dsh.mjs --set 4.10.0-dsh.2 -> 直接设为指定版本
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(here, '..', 'package.json')

function parseArgs() {
  const args = process.argv.slice(2)
  if (args[0] === '--set' && args[1]) return { mode: 'set', value: args[1].replace(/^v/, '') }
  if (args[0] && !args[0].startsWith('-')) return { mode: 'bump', upstream: args[0].replace(/^v/, '') }
  return { mode: 'bump', upstream: null }
}

function nextDshVersion(current, upstream) {
  const m = current.match(/^(\d+\.\d+\.\d+)-dsh\.(\d+)$/)
  if (m) {
    // 已带后缀
    if (upstream) {
      // 显式指定上游版本
      if (upstream !== m[1]) return `${upstream}-dsh.0`
      return `${m[1]}-dsh.${Number(m[2]) + 1}`
    }
    return `${m[1]}-dsh.${Number(m[2]) + 1}`
  }
  // 无后缀（兼容旧版本），视为 -dsh.0 的前身
  const base = upstream ?? current
  if (!/^\d+\.\d+\.\d+$/.test(base)) throw new Error(`无效版本: ${base}`)
  // 若提供了 upstream 且与 current 相同，说明是首次补后缀
  return `${base}-dsh.0`
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = pkg.version
const { mode, value, upstream } = parseArgs()

let next
if (mode === 'set') {
  if (!/^\d+\.\d+\.\d+-dsh\.\d+$/.test(value)) {
    console.error(`[bump-dsh] 无效版本: ${value}，应为 x.y.z-dsh.N（如 4.10.0-dsh.0）`)
    process.exit(1)
  }
  next = value
} else {
  if (upstream && !/^\d+\.\d+\.\d+$/.test(upstream)) {
    console.error(`[bump-dsh] 无效上游版本: ${upstream}`)
    process.exit(1)
  }
  next = nextDshVersion(current, upstream ?? null)
}

if (next === current) {
  console.log(`[bump-dsh] 已是 ${current}，无需变更`)
  process.exit(0)
}

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`[bump-dsh] ${current} -> ${next}`)
console.log(`[bump-dsh] 下一步: pnpm build && git commit -am "chore: bump to ${next}" && git tag v${next} && git push origin main --tags`)
