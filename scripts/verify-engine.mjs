/**
 * verify.mjs 的宿主版本门禁判定（纯函数，可独立测试）。
 *
 * 判据：package.json 的 engines.dsh 必须与 dsh 相关 peerDependencies 同代。
 * 旧实现用字符串 includes('<=0.2.1') 判断覆盖范围，既无法表达「同代」语义，
 * 又在声明升级到 0.2.2 代后把发布门禁永久打成 FAIL。
 */

/**
 * 从 peerDependencies 里挑出可比较下界的项。
 *
 * react/schemastery/cordis 用 ^ 或 ~，它们的版本号与宿主代无关；
 * 只有 dsh 系依赖写成 >= 下界形态，才是「同代」判定该看的目标。
 */
function hostPeers(peers) {
  return peers.filter((range) => typeof range === 'string' && range.startsWith('>='))
}

/** 提取范围里的下界版本号；无法解析时返回 null。 */
export function lowerBoundOf(range) {
  if (typeof range !== 'string') return null
  const m = range.match(/^>=([0-9][^\s]*)/)
  return m ? m[1] : null
}

/**
 * 取版本号的代标识（major.minor.patch）。
 *
 * 不能用 major.minor：DSH 的兼容性按 patch 级分裂，0.2.1 与 0.2.2 是两套 API，
 * 只比到 minor 会把它们误判为同代，门禁就失效了。
 */
export function generationOf(version) {
  const m = String(version).match(/^(\d+\.\d+\.\d+)/)
  return m ? m[1] : null
}

/**
 * 校验 engines.dsh 与 peer 下界是否同代。
 *
 * @param {string|undefined} enginesDsh - package.json engines.dsh
 * @param {string[]} peerRanges - 与宿主相关的 peer 版本范围
 * @returns {{ok: boolean, message: string}}
 */
export function checkEngineRange(enginesDsh, peerRanges) {
  if (typeof enginesDsh !== 'string' || enginesDsh.length === 0) {
    return { ok: false, message: '缺少 engines.dsh 声明' }
  }
  const engineLower = lowerBoundOf(enginesDsh)
  if (engineLower === null) {
    return { ok: false, message: `engines.dsh 无法解析下界：${enginesDsh}` }
  }
  const engineGen = generationOf(engineLower)
  if (engineGen === null) {
    return { ok: false, message: `engines.dsh 下界无法取代号：${engineLower}` }
  }

  const hosts = hostPeers(peerRanges)
  for (const range of hosts) {
    const peerLower = lowerBoundOf(range)
    if (peerLower === null) continue
    const peerGen = generationOf(peerLower)
    if (peerGen !== null && peerGen !== engineGen) {
      return {
        ok: false,
        message: `engines.dsh 下界 ${engineLower}（${engineGen} 代）与 peer ${range}（${peerGen} 代）不同代，声明矛盾`,
      }
    }
  }
  return { ok: true, message: `engines.dsh "${enginesDsh}" 与 peer 依赖同代（${engineGen}）` }
}
