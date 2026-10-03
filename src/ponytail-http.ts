/**
 * ponytail-http — HTTP 配置端点深模块（纯 Node 工厂，零 ctx）
 *
 * 从 apply() 剥离出的 /api/plugins/ponytail/config 处理器：
 * GET/POST 全部业务分支、请求体解析、响应组装、405 兜底内聚于此，
 * apply() 只保留 webServer.register 一行接线。
 * 依赖全部经 deps 注入（state / 解析函数 / 失效回调 / patch/env 原值），
 * 因此不经 Cordis ctx 即可用 node:test + 假 req/res 单测。
 */

import type { PonytailState } from './ponytail-state.js'
import type { RuntimeMode } from './ponytail-config.js'
import { resolvePriority } from './ponytail-priority.js'

export interface ConfigHttpDeps {
  /** 等级与技能开关状态机 */
  state: PonytailState
  /** 读取 config.json 的 defaultMode 原始值（undefined=缺失/损坏） */
  readRawConfigMode: () => string | undefined
  /** 变更后让宿主技能目录失效（UI 改禁用后模型侧即时收敛） */
  invalidateSkills: () => void
  /** cordis.patch.yml 显式声明的 defaultMode 原值 */
  patchMode: string | undefined
  /** 日志（沿用 ctx.logger 形状） */
  logger: { info: (msg: string) => void }
  /** PONYTAIL_DEFAULT_MODE 环境变量原值 */
  envRaw: string | undefined
}

/** GET/POST 响应共用的快照：等级、默认档（与 priority 同源）、禁用技能、技能列表、诊断链 */
function snapshot(state: PonytailState, deps: ConfigHttpDeps) {
  const currentMode = state.get() ?? 'off'
  const defaultMode = resolvePriority({
    envRaw: deps.envRaw,
    patchMode: deps.patchMode,
    configMode: deps.readRawConfigMode(),
  }).effective
  const disabledSkills = state.getDisabledSkills()
  const skillsList = SKILL_META.map((s) => ({
    ...s,
    enabled: state.isSkillEnabled(s.id),
  }))
  return {
    currentMode,
    defaultMode,
    disabledSkills,
    skills: skillsList,
    priority: resolvePriority({
      envRaw: deps.envRaw,
      patchMode: deps.patchMode,
      configMode: deps.readRawConfigMode(),
    }),
  }
}

// ponytail: 技能元数据硬编码保留于此（C2 将改为 SKILL.md frontmatter 真源），
// 面板展示与模型目录的描述若漂移，由 verify 反向断言兜底。
const SKILL_META = [
  { id: 'ponytail', name: 'ponytail', description: '懒人模式本体：3 档强度，梯子七阶注入' },
  { id: 'ponytail-review', name: 'ponytail-review', description: '过度设计评审：只挑能删的代码，一行一条' },
  { id: 'ponytail-audit', name: 'ponytail-audit', description: '全仓过度设计审计：按可删行数降序猎取臃肿' },
  { id: 'ponytail-debt', name: 'ponytail-debt', description: '债务台账收割：收割所有 ponytail: 注释，建立债务台账' },
  { id: 'ponytail-gain', name: 'ponytail-gain', description: '收益看板：展示 benchmark 中位数收益' },
  { id: 'ponytail-help', name: 'ponytail-help', description: '速查卡：模式、技能、命令与配置速查' },
]

/**
 * 创建 /api/plugins/ponytail/config 处理器。
 * @returns 纯 Node http handler（req/res），可被 webServer.register 直接消费
 */
export function createConfigHttpEndpoint(deps: ConfigHttpDeps):
  (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void> {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'GET') {
      res.writeHead(200)
      res.end(JSON.stringify(snapshot(deps.state, deps)))
      return
    }

    if (req.method === 'POST') {
      let bodyStr = ''
      for await (const chunk of req) {
        bodyStr += chunk
      }
      let payload: Record<string, unknown> = {}
      try {
        if (bodyStr) payload = JSON.parse(bodyStr)
      } catch {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      // 一键恢复默认配置
      if (payload.action === 'reset') {
        deps.state.resetToDefaults()
        deps.invalidateSkills()
        deps.logger.info('[ponytail] UI 一键重置为默认配置（full 等级，开启所有技能）')
      } else {
        // 修改等级（全局持久化与即时生效）
        if (typeof payload.mode === 'string') {
          const targetMode = payload.mode.toLowerCase()
          deps.state.setDefaultMode(targetMode)
          deps.state.set(targetMode === 'off' ? null : targetMode)
          deps.logger.info(`[ponytail] UI 切换运行等级：${targetMode}（已持久化为默认等级）`)
        }

        // 修改禁用的技能列表（物理隐藏）
        if (Array.isArray(payload.disabledSkills)) {
          const newDisabled = payload.disabledSkills.filter((s): s is string => typeof s === 'string')
          deps.state.setDisabledSkills(newDisabled)
          if (newDisabled.includes('ponytail')) {
            deps.state.set(null)
          }
          deps.invalidateSkills()
          deps.logger.info(`[ponytail] UI 更新禁用技能列表：${JSON.stringify(newDisabled)}`)
        }

        // 切换单个技能
        if (typeof payload.toggleSkill === 'object' && payload.toggleSkill !== null) {
          const tg = payload.toggleSkill as { name?: string; enabled?: boolean }
          if (typeof tg.name === 'string') {
            deps.state.toggleSkill(tg.name, tg.enabled)
            if (tg.name === 'ponytail' && tg.enabled === false) {
              deps.state.set(null)
            }
            deps.invalidateSkills()
            deps.logger.info(`[ponytail] UI 切换技能 ${tg.name} 状态：${tg.enabled}`)
          }
        }
      }

      res.writeHead(200)
      res.end(JSON.stringify({ success: true, ...snapshot(deps.state, deps) }))
      return
    }

    res.writeHead(405)
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
  }
}
