import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const cwd = 'E:/newCC/aaa-dsh-go/dsh-ponytail';
const msg = "release: 5.1.0\n\nBreaking：\n- 配置与 flag 的落点从全局数据根改为 profile 目录（profiles/<name>/ponytail/）。\n  升级用户的当前档位会重置为 full。\n- 优先级链从四级降为三级（env > patch > fallback），config.json 层退役，\n  界面上的「用户配置文件」一行已移除。\n\nFix：\n- 客户端显式 ctx.remote.$mount 自己的贡献。面板此前永久显示「诊断信息不可用」，\n  根因是网关命名空间不是按需自动开通的，客户端不挂载就永不出现。\n- 等级锁定判定改为只认 env 命中；此前兜底层恒命中导致按钮永久禁用、提示在说谎。\n\ndocs-verify 不再写死版本号，改成跟随 package.json.version —— 每次发版都要改门禁里的\n硬编码版本号本身就是设计缺陷：它会在改版本时被临时绕开或干脆漏改。ADR-0008 保持\n原样（历史决策快照不应随发版改写）。";
writeFileSync(cwd + '/.git/COMMIT_EDITMSG', msg, 'utf8');
execFileSync('git', ['add', '-A'], { cwd, stdio: 'inherit' });
execFileSync('git', ['commit', '-q', '-F', '.git/COMMIT_EDITMSG'], { cwd, stdio: 'inherit' });
console.log(execFileSync('git', ['log', '--oneline', '-1'], { cwd }).toString());
console.log('status: ' + JSON.stringify(execFileSync('git', ['status', '--short'], { cwd }).toString()));
