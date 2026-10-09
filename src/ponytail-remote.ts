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

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { PriorityReport } from './ponytail-priority.js'
import {
  readSkillMeta as loadSkillMeta,
  readSkillDescriptions as loadSkillDescriptions,
  type SkillLang,
  type SkillMeta,
} from './ponytail-skills.js'

export type { SkillLang, SkillMeta }

/**
 * 从包内描述文件读取技能元数据；文件不可读或缺项时回退短描述。
 * 委托至领域深模块 ponytail-skills 统一实现，遵守单一真源。
 */
export function readSkillMeta(lang?: SkillLang): SkillMeta[] {
  return loadSkillMeta(lang)
}

/**
 * 读 skills/descriptions.<lang>.json；不可读返回 null 由调用方回退。
 * 委托至领域深模块 ponytail-skills 统一实现。
 */
export function readSkillDescriptions(lang?: SkillLang): Record<string, string> | null {
  return loadSkillDescriptions(lang)
}

/** 跨端下发的只读快照：形状必须是 lossless JSON（typert-protocol 的 isRemoteJsonValue） */
export interface PonytailRemoteSnapshot {
  /** 当前会话生效的等级（null 表示关闭，序列化为字符串 'off'） */
  currentMode: string
  /** 三级优先级诊断链 */
  priority: PriorityReport
  /** 技能描述语言（服务端解析后的有效语言：显式值或按宿主对齐值；面板据此展示） */
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
