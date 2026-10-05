import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const msg = "docs: 记录 profile 下沉与三级链，新增 ADR-0009\n\nREADME 的启动链、优先级、面板描述与兼容说明同步到三级 env > patch > fallback 与\nprofile 维度落点，并说清 defaultMode 不设 Schema 默认值是为了区分「配过」与\n「没配过」，界面因此不会说谎。\n\nCHANGELOG 的 Unreleased 段补齐本轮三项变更：\n- profile 维度：配置文件读写与 createDiskStorage 接受 profileDir，落点改\n  profiles/<name>/ponytail/；全局旧 config.json 一次性导入后改名。\n- 优先级链降为三级，config 层退役，locale 同步删除对应键。\n- 客户端显式 ctx.remote.$mount 自己的贡献；此前只读命名空间却从未挂载，而\n  网关命名空间不是按需自动开通的（dsh-api-remotes 只遍历编译期写死的 25 个\n  官方贡献），面板因此永久显示「诊断信息不可用」。$mount 返回即就绪，轮询一并删除。\n- 等级锁定判定改为只认 env 命中。\n\n新增 ADR-0009 记录决策与验证证据；ADR-0004 补修订注记并标注「统一数据根不等于\n全局共享」，ADR-0005 标注清理已完成，0006 / 0007 标注被降级修订。\n\n门禁：build / typecheck / verify / docs-verify / 行为测试 85 项全绿。";
const cwd = 'E:/newCC/aaa-dsh-go/dsh-ponytail';
writeFileSync(cwd + '/.git/COMMIT_EDITMSG', msg, 'utf8');
execFileSync('git', ['commit', '-q', '-a', '-F', '.git/COMMIT_EDITMSG'], { cwd, stdio: 'inherit' });
execFileSync('git', ['add', '-A'], { cwd, stdio: 'inherit' });
execFileSync('git', ['commit', '-q', '-F', '.git/COMMIT_EDITMSG'], { cwd, stdio: 'inherit' });
console.log(execFileSync('git', ['log', '--oneline', '-1'], { cwd }).toString());
