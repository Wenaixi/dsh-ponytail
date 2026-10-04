import type { PonytailState } from './ponytail-state.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_MODE, normalizeMode } from './ponytail-config.js'

export function filterSkillBodyForMode(body: string, mode: string): string {
  const effectiveMode = normalizeMode(mode) ?? (DEFAULT_MODE as string)
  const withoutFrontmatter = String(body ?? '').replace(/^---[\s\S]*?---\s*/, '')
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/)
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1]!.trim())
        if (labelMode) return labelMode === effectiveMode
      }
      // 中文化正文用「」与中文冒号，上游 ASCII 引号正则失配；兼容两种形态
      const exampleLabel = line.match(/^-\s*([^:]+)(?:：|:)\s*["「]/)
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1]!.trim())
        if (labelMode) return labelMode === effectiveMode
      }
      return true
    })
    .join('\n')
}

export function getFallbackInstructions(mode: string): string {
  const m = mode
  return (
    'PONYTAIL 已激活 \u2014 等级：' +
    m +
    '\n\n' +
    '你是一位懒惰的资深工程师，懒惰意味着高效，而不是马虎。最好的代码就是没写的代码。\n\n' +
    '## 持久化\n\n' +
    '每一次回复都生效，不会退化。仅在「stop ponytail / 正常模式」时关闭。\n\n' +
    '当前等级：**' +
    m +
    '**，切换方式：`/ponytail lite|full|ultra`。\n\n' +
    '## 梯子\n\n' +
    '写代码前，先站在第一个站得住的横档上（先理解问题，再选解法）：\n' +
    '1. 这东西真的需要存在吗？（YAGNI）\n' +
    '2. 代码库里已经有了吗？直接复用，不要重写。\n' +
    '3. 标准库能做吗？用标准库。\n' +
    '4. 平台原生能力能覆盖吗？用原生。\n' +
    '5. 已安装的依赖能解决吗？用它。\n' +
    '6. 能用一行写完吗？就写一行。\n' +
    '7. 只有到这里：再写能工作的最小代码。\n\n' +
    '修 Bug = 修根因：先 grep 要改函数的所有调用方，在共享函数里修一次，而不是在每个调用方各打一个补丁。\n\n' +
    '## 规则\n\n' +
    '不做未被要求的抽象，不引入可避免的依赖，不写没人要的样板。删除优于新增，无聊优于巧妙，文件数越少越好。' +
    '先给懒人版，并在同一条回复里追问复杂需求是否真的需要。两个等大的标准库方案选边界更正确的那个。' +
    '有意简化的已知天花板用 `ponytail:` 注释标出天花板和升级路径。\n\n' +
    '## 输出\n\n' +
    '先给代码，再用最多三行短句说明跳过了什么、何时再加。若解释比代码还长，删掉解释。用户明确要求的解释请完整给出。\n\n' +
    '## 何时不要偷懒\n\n' +
    '永远不要为偷懒而简化掉：对问题的完整理解、信任边界的输入校验、防止数据丢失的错误处理、安全、无障碍、硬件所需的校准、用户明确要求保留的内容。' +
    '非平凡逻辑留下一个可运行的最小校验（基于 assert 的自检或单个小测试文件），平凡的一行不需要测试。\n\n' +
    '## 边界\n\n' +
    'Ponytail 管的是怎么构建，而不是怎么说话。「stop ponytail / 正常模式」即退出，等级保持到被修改或会话结束。'
  )
}

// 兼容旧路径解析：给定 skillDir 返回主技能路径
export function getMainSkillPath(skillDir: string): string {
  return join(skillDir, 'ponytail', 'SKILL.md')
}

/** 独立模式：不走主技能正文裁剪，由同名技能定义行为（上游 INDEPENDENT_MODES 同构） */
const INDEPENDENT_MODES = new Set(['review'])

/**
 * 渲染当前等级的 always-on 指令文本（参考上游 getPonytailInstructions 语义）。
 * 深模块：路径解析、review 短路、读盘、按等级裁剪、失败回退全部内聚于此。
 * 无 ctx、无状态、自身绝不抛（读盘失败回退内置文本），满足 systemPrompt section
 * 的同步 text 契约。skillDir 显式传入：上游硬编码包内路径，DSH 允许 config.skillDir 覆盖。
 */
export function render(skillDir: string, mode: string): string {
  if (INDEPENDENT_MODES.has(mode)) {
    return 'PONYTAIL 已激活 — 等级：' + mode + '，行为由 /ponytail-' + mode + ' 技能定义。'
  }
  try {
    const raw = readFileSync(getMainSkillPath(skillDir), 'utf8')
    return 'PONYTAIL 已激活 — 等级：' + mode + '\n\n' + filterSkillBodyForMode(raw, mode)
  } catch {
    return getFallbackInstructions(mode)
  }
}

/**
 * SystemPrompt section 的唯一高阶深模块出口：
 * 封装从状态外部纠偏（syncFromFile）、激活与关闭态守卫（off/null 返回空串）、
 * 到按需直读模板（ADR-0003）与保底降级渲染的完整链路。
 */
export function renderPromptSection(skillDir: string, state: PonytailState): string {
  state.syncFromFile()
  const mode = state.get()
  if (!mode || mode === 'off') return ''
  return render(skillDir, mode)
}
