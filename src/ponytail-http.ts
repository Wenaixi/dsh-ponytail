/**
 * ponytail-http — HTTP 配置端点深模块（纯 Node 工厂，零 ctx）
 *
 * 从 apply() 剥离出的 /api/plugins/ponytail/config 处理器：
 * GET/POST 全部业务分支、请求体解析、响应组装、405 兜底内聚于此，
 * apply() 只保留 webServer.register 一行接线。
 * 依赖全部经 deps 注入（state / 解析函数 / 失效回调 / patch/env 原值），
 * 因此不经 Cordis ctx 即可用 node:test + 假 req/res 单测。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { PonytailState } from './ponytail-state.js'
import type { RuntimeMode } from './ponytail-config.js'
import { resolvePriority } from './ponytail-priority.js'
import { isMainSkillDisabled } from './ponytail-state.js'

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
  /** 技能目录（读取 SKILL.md frontmatter 作为元数据真源） */
  skillDir: string
}

/** GET/POST 响应共用的快照：等级、默认档（与 priority 同源）、禁用技能、技能列表、诊断链 */
function snapshot(state: PonytailState, deps: ConfigHttpDeps) {
  const currentMode = state.get() ?? 'off'
  // C3 合并：同快照内只求值一次（读盘一次、resolvePriority 一次），
  // defaultMode 与 priority.effective 由同一 report 保证同源同值。
  const report = resolvePriority({
    envRaw: deps.envRaw,
    patchMode: deps.patchMode,
    configMode: deps.readRawConfigMode(),
  })
  const disabledSkills = state.getDisabledSkills()
  const skillsList = readSkillMeta(deps.skillDir).map((s) => ({
    ...s,
    enabled: state.isSkillEnabled(s.id),
  }))
  return {
    currentMode,
    defaultMode: report.effective,
    disabledSkills,
    skills: skillsList,
    priority: report,
  }
}

// 兜底元数据：仅当 frontmatter 目录不可读时使用（正常路径以 SKILL.md 为唯一真源，
// 见 readSkillMeta）。与面板构建期快照同源，防 API 离线时面板空白。
const FALLBACK_SKILL_META = [
  { id: 'ponytail', name: 'ponytail', description: '懒人模式本体：3 档强度，梯子七阶注入' },
  { id: 'ponytail-review', name: 'ponytail-review', description: '过度设计评审：只挑能删的代码，一行一条' },
  { id: 'ponytail-audit', name: 'ponytail-audit', description: '全仓过度设计审计：按可删行数降序猎取臃肿' },
  { id: 'ponytail-debt', name: 'ponytail-debt', description: '债务台账收割：收割所有 ponytail: 注释，建立债务台账' },
  { id: 'ponytail-gain', name: 'ponytail-gain', description: '收益看板：展示 benchmark 中位数收益' },
  { id: 'ponytail-help', name: 'ponytail-help', description: '速查卡：模式、技能、命令与配置速查' },
]

// ponytail: 面板展示与模型目录的描述以 SKILL.md frontmatter 为唯一真源；
// 若自定义 skillDir 指向坏目录，回退兜底列表（不抛错、面板不空白）。升级路径：
// 未来若想热改生效，把 skillDir 纳入官方 filesystem provider 的 customSkillDirs 复用其
// chokidar watcher，而非自建监听（ADR-0003 无状态直读精神）。
export interface SkillMeta { id: string; name: string; description: string }

function parseSkillFrontmatter(filePath: string): { description?: string } | null {
  try {
    const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    if (!raw.startsWith('---\n')) return null
    const end = raw.indexOf('\n---\n')
    if (end < 0) return null
    const fm = parseYaml(raw.slice(4, end))
    if (typeof fm !== 'object' || fm === null || Array.isArray(fm)) return null
    const desc = (fm as Record<string, unknown>)['description']
    return { description: typeof desc === 'string' ? desc : undefined }
  } catch {
    return null
  }
}

/**
 * 从 skills/ 目录读取全部技能元数据（SKILL.md frontmatter 为唯一真源）。
 * 不按禁用状态过滤——面板需要展示全部 6 项（enabled 由 state.isSkillEnabled 标记）。
 * 目录/文件不可读时回退 FALLBACK_SKILL_META（不抛错）。
 */
export function readSkillMeta(skillDirPath: string): SkillMeta[] {
  let names: string[] = []
  try {
    names = readdirSync(skillDirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort()
  } catch {
    return FALLBACK_SKILL_META.map((m) => ({ ...m }))
  }
  const metas: SkillMeta[] = []
  for (const name of names) {
    const fm = parseSkillFrontmatter(join(skillDirPath, name, 'SKILL.md'))
    metas.push({ id: name, name, description: fm?.description ?? name })
  }
  return metas.length > 0 ? metas : FALLBACK_SKILL_META.map((m) => ({ ...m }))
}

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
          if (isMainSkillDisabled(newDisabled)) {
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
            if (isMainSkillDisabled([tg.name]) && tg.enabled === false) {
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
