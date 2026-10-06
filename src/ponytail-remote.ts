/**
 * ponytail-remote — 只读推导值的官方跨端通道
 *
 * 迁移到官方配置组合后，可持久化字段（defaultMode、disabledSkills、skillDescriptionLang）由
 * Cordis Config 的 volatile 字段承载，官方表单负责读写；但「优先级诊断链」与「当前生效等级」
 * 是**运行时推导值**，不是配置——它们由环境变量、profile 补丁与内置兜底三层按优先级合并得出，
 * 写进配置层等于让缓存永久盖住真值（env 只有进程重启才变，落盘反而会遮蔽新值）。
 *
 * 因此这两个值走 DSH 官方的 Typert 通道下发，而不是自制 HTTP：
 * - 宿主导出 `TypertRemoteService` 子类，命名空间 `ponytail`；
 * - 网关按服务上的 `typertRemote` 绑定自动发现端点（dsh-api-gateway/lib/index.js:706-719），
 *   无需在任何注册表里登记；
 * - 浏览器侧以 `ctx.remote.ponytail.snapshot()` 调用，走已有的 RPC 载体。
 *
 * 技能描述的语言也在这个通道上：模型目录与配置面板消费的是同一个字符串，
 * 由配置决定下哪一套，缓存的构建期常量会让切换停在旧语言。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { PriorityReport } from './ponytail-priority.js'

/** 技能描述的语言。与 Config.skillDescriptionLang 同一取值域。 */
export type SkillLang = 'zh' | 'en'

/** 技能 id 列表与描述的唯一真源：skills/descriptions.{lang}.json */
const SKILL_IDS = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help'] as const

/**
 * 短描述兜底：描述文件不可读时用（模型目录与面板至少有一行说明，不至于空白）。
 * 完整描述在 skills/descriptions.{lang}.json，不在此重复。
 */
const FALLBACK_DESCRIPTION: Record<SkillLang, Record<string, string>> = {
  zh: {
    'ponytail': '懒人模式本体：7 阶梯子，lite/full/ultra 三档强度',
    'ponytail-review': '过度设计评审：只挑能删的代码，一行一条',
    'ponytail-audit': '全仓过度设计审计：按可删行数降序猎取臃肿',
    'ponytail-debt': '收割 ponytail: 注释列成债务台账',
    'ponytail-gain': '收益看板：benchmark 中位数实测收益',
    'ponytail-help': '速查卡：模式、技能与命令',
  },
  en: {
    'ponytail': 'Lazy senior dev mode: seven-rung ladder, lite/full/ultra',
    'ponytail-review': 'Over-engineering review: only what can be deleted',
    'ponytail-audit': 'Whole-repo audit for over-engineering, ranked by cut size',
    'ponytail-debt': 'Harvest ponytail: shortcut comments into a debt ledger',
    'ponytail-gain': 'Measured-impact scoreboard from benchmark medians',
    'ponytail-help': 'Quick reference: modes, skills, commands',
  },
}

// ponytail: 面板展示与模型目录的描述以 skills/descriptions.{lang}.json 为唯一真源；
// 描述文件不可读时回退 FALLBACK_DESCRIPTION（不抛错、面板不空白）。升级路径：
// 若自定义 skillDir 指向坏目录，需要把描述随目录一起提供时，再让读侧接受
// skillDir 内的描述覆盖，而非从包内固定路径读。

export interface SkillMeta {
  id: string
  name: string
  description: string
}

/**
 * 从包内描述文件读取技能元数据；文件不可读或缺项时回退短描述。
 *
 * lang 缺省或非法一律按 zh 处理：调用方（面板、Provider）读的是配置值，
 * 而配置可能来自手写的补丁，不保证取值域干净。
 */
export function readSkillMeta(lang?: SkillLang): SkillMeta[] {
  const safeLang: SkillLang = lang === 'en' ? 'en' : 'zh'
  const text = readSkillDescriptions(safeLang)
  return SKILL_IDS.map((id) => ({
    id,
    name: id,
    description: text?.[id] ?? FALLBACK_DESCRIPTION[safeLang][id] ?? id,
  }))
}

/** 读 skills/descriptions.<lang>.json；不可读返回 null 由调用方回退。 */
export function readSkillDescriptions(lang?: SkillLang): Record<string, string> | null {
  try {
    const raw = readFileSync(
      new URL(`../skills/descriptions.${lang === 'en' ? 'en' : 'zh'}.json`, import.meta.url),
      'utf8',
    ).replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const id of SKILL_IDS) {
      const value = parsed[id]
      if (typeof value === 'string' && value.length > 0) out[id] = value
    }
    return Object.keys(out).length === SKILL_IDS.length ? out : null
  } catch {
    return null
  }
}

/** 跨端下发的只读快照：形状必须是 lossless JSON（typert-protocol 的 isRemoteJsonValue） */
export interface PonytailRemoteSnapshot {
  /** 当前会话生效的等级（null 表示关闭，序列化为字符串 'off'） */
  currentMode: string
  /** 三级优先级诊断链 */
  priority: PriorityReport
  /** 技能描述语言（与配置同源，面板据此展示） */
  skillLang: SkillLang
  /** 6 个技能元数据，描述已按 skillLang 取好 */
  skills: SkillMeta[]
}

export interface PonytailRemoteDeps {
  snapshot(): PonytailRemoteSnapshot
}

/**
 * 远程服务：只暴露 snapshot 一个只读端点。
 *
 * 写操作一律不在这里——它们走 settings（官方配置通道），由宿主负责校验、
 * revision 冲突检测与 loader 的 volatile 热提交。这里多开一个写端点等于绕过那套保护。
 *
 * `@Remote('snapshot')` 用字符串形式：仓库 tsconfig 的 experimentalDecorators 为 false
 * （标准装饰器），零参 `@Remote()` 在该语义下拿不到 class context，TS 会报 TS2554/TS1241。
 */
export class PonytailRemote extends TypertRemoteService {
  private readonly deps: PonytailRemoteDeps

  constructor(ctx: Context, deps: PonytailRemoteDeps) {
    super(ctx, 'ponytailRemote', { namespace: 'ponytail' })
    this.deps = deps
  }

  @Remote('snapshot')
  snapshot(): PonytailRemoteSnapshot {
    return this.deps.snapshot()
  }
}
