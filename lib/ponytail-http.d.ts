/**
 * ponytail-http — HTTP 配置端点深模块（纯 Node 工厂，零 ctx）
 *
 * 从 apply() 剥离出的 /api/plugins/ponytail/config 处理器：
 * GET/POST 全部业务分支、请求体解析、响应组装、405 兜底内聚于此，
 * apply() 只保留 webServer.register 一行接线。
 * 依赖全部经 deps 注入（state / 解析函数 / 失效回调 / patch/env 原值），
 * 因此不经 Cordis ctx 即可用 node:test + 假 req/res 单测。
 */
import type { PonytailState } from './ponytail-state.js';
export interface ConfigHttpDeps {
    /** 等级与技能开关状态机 */
    state: PonytailState;
    /** 读取 config.json 的 defaultMode 原始值（undefined=缺失/损坏） */
    readRawConfigMode: () => string | undefined;
    /** 变更后让宿主技能目录失效（UI 改禁用后模型侧即时收敛） */
    invalidateSkills: () => void;
    /** cordis.patch.yml 显式声明的 defaultMode 原值 */
    patchMode: string | undefined;
    /** 日志（沿用 ctx.logger 形状） */
    logger: {
        info: (msg: string) => void;
    };
    /** PONYTAIL_DEFAULT_MODE 环境变量原值 */
    envRaw: string | undefined;
}
/**
 * 创建 /api/plugins/ponytail/config 处理器。
 * @returns 纯 Node http handler（req/res），可被 webServer.register 直接消费
 */
export declare function createConfigHttpEndpoint(deps: ConfigHttpDeps): (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>;
//# sourceMappingURL=ponytail-http.d.ts.map