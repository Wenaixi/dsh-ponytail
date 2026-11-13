import test from 'node:test'
import assert from 'node:assert/strict'
import { checkEngineRange } from './verify-engine.mjs'

test('接受与 peerDependencies 同代的下界声明', () => {
  // package.json 实际值：engines.dsh 与 dsh-skill peer 都在 0.2.2 代
  const result = checkEngineRange('>=0.2.2-rc.1', ['>=0.2.2-rc.1', '^3.19.0'])
  assert.equal(result.ok, true, result.message)
})

test('拒绝声称支持旧代却依赖新代的矛盾声明', () => {
  // engines 说支持 0.2.1，但 peer 已经锁在 0.2.2：宿主会按 engines 放行旧版，
  // 装上后 peer 解析失败 —— 这正是本门禁要拦的元数据自相矛盾
  const result = checkEngineRange('>=0.2.0-rc.1 <=0.2.1', ['>=0.2.2-rc.1'])
  assert.equal(result.ok, false)
  assert.match(result.message, /同代|矛盾/)
})

test('缺失 engines.dsh 时明确报错', () => {
  const result = checkEngineRange(undefined, ['>=0.2.2-rc.1'])
  assert.equal(result.ok, false)
  assert.match(result.message, /engines\.dsh/)
})

test('对非 dsh 相关 peer 一律忽略，不影响判定', () => {
  const result = checkEngineRange('>=0.2.2-rc.1', ['^18.2.0', '~4.1.0', '^3.19.0'])
  assert.equal(result.ok, true, result.message)
})
