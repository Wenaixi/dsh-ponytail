#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function nextVersion(current, requested) {
  if (!versionPattern.test(current)) throw new Error('当前版本必须是本地 SemVer x.y.z')
  if (requested !== undefined) {
    const version = requested.replace(/^v/, '')
    if (!versionPattern.test(version)) throw new Error('版本必须是本地 SemVer x.y.z，不接受 -dsh.N 或预发布格式')
    return version
  }
  const [major, minor, patch] = current.split('.').map(Number)
  return [major, minor, patch + 1].join('.')
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const args = process.argv.slice(2)
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  try {
    const next = nextVersion(packageJson.version, args[0])
    if (next === packageJson.version) {
      console.log(`[version] 已是 ${next}，无需变更`)
      process.exit(0)
    }
    const previous = packageJson.version
    packageJson.version = next
    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8')
    console.log(`[version] ${previous} -> ${next}`)
    console.log('[version] 下一步：pnpm build，提交本地变更，再按发布流程创建 tag')
  } catch (error) {
    console.error(`[version] ${error.message}`)
    process.exit(1)
  }
}
