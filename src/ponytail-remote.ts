/**
 * ponytail-remote — 只读推导值的官方跨端通道
 *
 * 迁移到官方配置组合后，可持久化字段（defaultMode、disabledSkills）由 Cordis Config 的
 * volatile 字段承载，官方表单负责读写；但「优先级诊断链」与「当前生效等级」是**运行时推导值**，
 * 不是配置——它们由环境变量、profile 补丁与内置兜底三层按优先级合并得出，
 * 写进配置层等于让缓存永久盖住真值（env 只有进程重启才变，落盘反而会遮蔽新值）。
 *
 * 因此这两个值走 DSH 官方的 Typert 通道下发，而不是自制 HTTP：
 * - 宿主导出 `TypertRemoteService` 子类，命名空间 `ponytail`；
 * - 网关按服务上的 `typertRemote` 绑定自动发现端点（dsh-api-gateway/lib/index.js:706-719），
 *   无需在任何注册表里登记；
 * - 浏览器侧以 `ctx.remote.ponytail.snapshot()` 调用，走已有的 RPC 载体。
 *
 * 本模块同时承载技能元数据读取（SKILL.md frontmatter 为唯一真源），
 * 原先它挂在 HTTP 端点上，删除 HTTP 后由这里继续提供。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { PriorityReport } from './ponytail-priority.js'

// 兜底元数据：仅当 frontmatter 目录不可读时使用（正常路径以 SKILL.md 为唯一真源，
// 见 readSkillMeta）。与客户端构建期快照同源，防目录不可读时面板空白。
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

/** 跨端下发的只读快照：形状必须是 lossless JSON（typert-protocol 的 isRemoteJsonValue） */
export interface PonytailRemoteSnapshot {
  /** 当前会话生效的等级（null 表示关闭，序列化为字符串 'off'） */
  currentMode: string
  /** 三级优先级诊断链 */
  priority: PriorityReport
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
