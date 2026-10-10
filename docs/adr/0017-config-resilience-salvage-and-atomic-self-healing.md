# ADR-0017: 配置韧性自愈提取引擎与崩溃安全原子持久化

- **状态**：已采纳 (Accepted)
- **日期**：2026-10-10
- **相关决策**：[ADR-0005](./0005-config-under-dsh-home.md), [ADR-0009](./0009-profile-scoped-config-and-flag.md), [ADR-0014](./0014-turn-coordinator-sink-seam-unification.md), [ADR-0016](./0016-session-transition-atomicity-and-sink-deepening.md)

---

## 背景与问题陈述 (Context & Problem)

在实际复杂运行环境（如系统掉电、进程意外强杀、磁盘瞬态 I/O 抖动或外部人工手改格式错误）中，配置与会话状态文件容易遭遇物理损坏（如写入截断、缺失闭合括号、悬挂逗号、乱码污染）。在原先的实现中：
1. **破损丢弃与粗暴回退**：`parseConfigFile` 与 `createDiskStorage.readSessions` 仅简单使用 `try / catch (JSON.parse)`，一旦解析失败便直接丢弃文件内容并回退空字典，导致用户原本精心配置的运行等级、禁用技能名单及长会话基线彻底丢失；
2. **直写截断风险**：物理写盘直接调用 `writeFileSync`，若在写入途中遭遇进程被杀或掉电，容易在磁盘上留下 0 字节或半截断的坏文件，破坏持久化稳定性；
3. **缺乏自动修复与现场留样**：文件损坏后系统不会主动修复该物理文件，导致后续其它工具或独立进程读取时持续报错。

---

## 架构决断 (Decision)

依据工业级软件容灾准则，在持久化层深模块（`src/ponytail-settings.ts` 与 `src/ponytail-state.ts`）实装**配置韧性自愈防御引擎 (Config Resilience & Self-Healing Engine)**：

### 1. 启发式多阶配置抢救提取流水线 (`salvageConfig`)
当 `config.json` 遭遇损坏导致标准 `JSON.parse` 失败时，启动双阶启发式提取：
- **第一阶（语法自动修补）**：清洗不可打印控制字符、清除对象与数组尾部的悬挂逗号、统计缺失的大括号/中括号并自动补全闭合，再次尝试 `JSON.parse`；
- **第二阶（正则模式深度捞回）**：若语法修补未果，针对 `defaultMode`、`disabledSkills`、`skillDescriptionLang` 及通用标量键值启动模式正则扫描，最大化抢救用户有效数据。

### 2. 现场留样备份与合法自愈重新生成
在检测到损坏并完成抢救后：
- 将损坏原文备份为 `config.json.corrupted.<timestamp>`（最多轮转保留 3 份历史留样，避免无限制占用磁盘）；
- 将抢救出的配置数据通过标准 JSON 格式化，原地**自动重新生成**一份合法的健康文件，使系统和后续外部读取完全平滑自愈。

### 3. 崩溃安全原子写盘 (`safeAtomicWriteFile`)
淘汰所有直接覆写逻辑，写盘一律经由：
`同目录唯一临时文件写入 -> renameSync 原子重命名替换目标文件`。
从物理底层杜绝写盘中途崩溃导致的文件截断与 0 字节破损。

### 4. 会话状态持久化双重自愈 (`session-states.json`)
将语法闭合修复与截断容错正则下沉至 `createDiskStorage.readSessions`，确保历史会话的 `sessionId` 与 `baselineMode` 在坏块中也能被成功提取并原地自愈重写，永久捍卫大模型 Prompt Cache 零破坏。

---

## 架构收益 (Consequences)

- **极高容灾韧性**：即使物理配置文件遭遇严重截断破坏，用户配置亦能被完整抢救提取，且磁盘文件自动恢复健康；
- **崩溃安全**：原子写盘彻底消除掉电文件截断隐患；
- **Test Surface 覆盖**：新增高价值破坏注入测试 C33（配置损坏自愈）与 C34（会话状态损坏自愈），行为测试基线提升至 **112 项全绿**。
