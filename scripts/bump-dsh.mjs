#!/usr/bin/env node
// scripts/bump-dsh.mjs — 在上游未发版时递增 DSH 后缀版本
// 用法：node scripts/bump-dsh.mjs          -> 4.9.0 => 4.9.0-dsh.1
//      node scripts/bump-dsh.mjs 4.9.0     -> 显式指定上游版本
//      node scripts/bump-dsh.mjs --set 4.9.0-dsh.2 -> 直接设为指定版本
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
  // 若当前已是 suffix（如 4.9.0-dsh.1），递增 N
  const m = current.match(/^(\d+\.\d+\.\d+)-dsh\.(\d+)$/)
  if (m) {
    const base = upstream ?? m[1]
    // 若 upstream 与 base 不一致，说明上游已更新，回归纯上游
    if (upstream && upstream !== m[1]) return upstream
    return `${m[1]}-dsh.${Number(m[2]) + 1}`
  }
  // 纯上游版本（如 4.9.0）
  const base = upstream ?? current
  // 若 upstream 指定且与 current 相同，说明是 DSH 侧独立迭代
  if (!upstream && /^\d+\.\d+\.\d+$/.test(current)) return `${current}-dsh.1`
  if (upstream && upstream === current) return `${current}-dsh.1`
  if (upstream) return upstream
  return `${current}-dsh.1`
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = pkg.version
const { mode, value, upstream } = parseArgs()

let next
if (mode === 'set') {
  if (!/^\d+\.\d+\.\d+(-dsh\.\d+)?$/.test(value)) {
    console.error(`[bump-dsh] 无效版本: ${value}，应为 x.y.z 或 x.y.z-dsh.N`)
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
