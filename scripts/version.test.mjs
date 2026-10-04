import test from 'node:test'
import assert from 'node:assert/strict'
import { nextVersion } from './version.mjs'

test('本地版本可递增 patch', () => {
  assert.equal(nextVersion('5.0.0'), '5.0.1')
})

test('本地版本支持显式设置', () => {
  assert.equal(nextVersion('5.0.0', '5.1.0'), '5.1.0')
  assert.equal(nextVersion('5.0.0', 'v5.1.0'), '5.1.0')
})

test('拒绝旧版 dsh 后缀和非法版本', () => {
  assert.throws(() => nextVersion('4.10.0-dsh.12'), /本地 SemVer/)
  assert.throws(() => nextVersion('5.0.0', '5.0.0-dsh.1'), /不接受/)
  assert.throws(() => nextVersion('5.0.0', 'v5'), /本地 SemVer/)
})
