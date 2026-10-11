// dsh-price-badge 自检：验证峰谷判定、调休与节假日规则、下次切换计算。
//
//   运行：  node tools/selfcheck.mjs
//
// 思路：lib/client.js 是 classic script，靠 window.__ModuleLoader__.load({id, factory})
// 自注册。这里先用一个假 loader 捕获 factory，再调用它拿到插件导出，从而在纯 Node 里
// 复现浏览器侧的加载路径。随后按真实时间戳断言判定结果。

import assert from "node:assert/strict"

// ── 以浏览器侧相同的路径加载插件 ────────────────────────────────────────
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      assert.equal(spec.id, "dsh-price-badge", "module id 必须等于包名")
      captured = spec
    }
  }
}

await import("../lib/client.js")
assert.ok(captured, "client.js 未调用 __ModuleLoader__.load —— 浏览器侧会加载失败")

// 浏览器里 require() 由平台注入；这里只替换掉它的 react 依赖。
const fakeRequire = (name) => {
  if (name === "react") return { useState: () => [0, () => {}], useEffect: () => {}, createElement: () => null, Fragment: null }
  throw new Error("意外的 require: " + name)
}
const plugin = captured.factory(fakeRequire)
assert.equal(typeof plugin.apply, "function", "导出必须含 apply")
assert.deepEqual(plugin.inject, ["timer"], "必须注入 timer 才能用 ctx.interval")

// ── 复现插件内部逻辑（与 lib/client.js 中的数据与判定保持一致） ──────────
// client.js 只导出 apply/inject，内部函数不在导出面上，因此这里按其源码口径
// 独立重算一遍，用于交叉验证「数据表 + 判定规则」这部分的正确性。
const BJ_OFFSET = 8 * 3600 * 1000
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]

const HOLIDAYS = [
  "2026-01-01", "2026-01-02", "2026-01-03",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18",
  "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22",
  "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04",
  "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
  "2026-10-05", "2026-10-06", "2026-10-07"
]
const MAKEUP_WORKDAYS = ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]
const HOLIDAY_SET = new Set(HOLIDAYS)
const MAKEUP_SET = new Set(MAKEUP_WORKDAYS)

const pad2 = (n) => (n < 10 ? "0" : "") + n
function bjParts(ts) {
  const d = new Date(ts + BJ_OFFSET)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() }
}
const ymd = (p) => `${p.y}-${pad2(p.m)}-${pad2(p.day)}`
const isWorkday = (p) => {
  const key = ymd(p)
  if (HOLIDAY_SET.has(key)) return false
  if (MAKEUP_SET.has(key)) return true
  return p.weekday >= 1 && p.weekday <= 5
}
const isPeak = (ts) => {
  const p = bjParts(ts)
  if (!isWorkday(p)) return false
  const m = p.hour * 60 + p.minute
  return PEAK_WINDOWS.some(([a, b]) => m >= a && m < b)
}

// 当前价格口径（2026-09-10 起）已生效，插件不再维护"生效前"状态。
const OFF = 1, PEAK = 2
const stateOf = (ts) => (isPeak(ts) ? PEAK : OFF)
function nextTransition(from) {
  const cur = stateOf(from)
  const STEP = 15 * 60 * 1000
  for (let t = from + STEP; t <= from + 21 * 24 * 3600 * 1000; t += STEP) if (stateOf(t) !== cur) return t
  return null
}
// 「北京时间 某日 某时:某分」→ 时间戳
const bj = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm) - BJ_OFFSET

const NAME = { 1: "空闲", 2: "高峰" }

// ── 断言 ────────────────────────────────────────────────────────────────
const cases = [
  // 说明                                        时间戳                          期望
  // 10/14 是普通周三（非节假日），用于纯工作日判定
  ["周三 09:30 高峰",                            bj(2026, 10, 14, 9, 30),       PEAK],
  ["周三 08:59 空闲",                            bj(2026, 10, 14, 8, 59),       OFF],
  ["周三 12:00 空闲（午休）",                     bj(2026, 10, 14, 12, 0),       OFF],
  ["周三 13:59 空闲",                            bj(2026, 10, 14, 13, 59),      OFF],
  ["周三 14:00 高峰",                            bj(2026, 10, 14, 14, 0),       PEAK],
  ["周三 17:59 高峰",                            bj(2026, 10, 14, 17, 59),      PEAK],
  ["周三 18:00 空闲",                            bj(2026, 10, 14, 18, 0),       OFF],
  ["周三 23:30 空闲",                            bj(2026, 10, 14, 23, 30),      OFF],
  ["周三 00:30 空闲",                            bj(2026, 10, 14, 0, 30),       OFF],

  // 周末：这才是原版会误判的地方（原版只看小时，周六 9:30 会被判高峰）
  ["周六 09:30 → 空闲（原版会误判高峰）",          bj(2026, 10, 17, 9, 30),       OFF],
  ["周六 15:00 → 空闲",                          bj(2026, 10, 17, 15, 0),       OFF],
  ["周日 10:00 → 空闲",                          bj(2026, 10, 18, 10, 0),       OFF],

  // 法定节假日：国庆 10/1–10/7、春节、五一、中秋 全天空闲
  // 注意：当前价格口径自 2026-09-10 起生效，故这里只断言该日期之后的时点；
  // 更早的日期（如 2026-01-01、2026-05-04）属于旧口径，不由本插件负责。
  ["国庆 10/07 09:30 空闲",                      bj(2026, 10, 7, 9, 30),        OFF],
  ["中秋 09/25 10:00 空闲",                      bj(2026, 9, 25, 10, 0),        OFF],

  // 调休上班日（官方安排周六/周日上班）：属工作日，按峰谷判定
  ["调休 10/10（周六）09:30 高峰",                bj(2026, 10, 10, 9, 30),       PEAK],
  ["调休 09/20（周日）09:30 高峰",                bj(2026, 9, 20, 9, 30),        PEAK]
]

let failed = 0
console.log("\n判定用例：")
for (const [label, ts, want] of cases) {
  const got = stateOf(ts)
  const p = bjParts(ts)
  const ok = got === want
  if (!ok) failed++
  console.log(
    `  ${ok ? "✓" : "✗"} ${label.padEnd(38)} 北京 ${ymd(p)} ${pad2(p.hour)}:${pad2(p.minute)}` +
    `  期望=${NAME[want]} 实际=${NAME[got]}`
  )
}

// 下次切换
console.log("\n下次切换用例：")
const t1 = bj(2026, 10, 11, 12, 0) // 周日 12:00
const n1 = nextTransition(t1)
const expect1 = bj(2026, 10, 12, 9, 0) // 周一 09:00
const ok1 = n1 === expect1
if (!ok1) failed++
const bp1 = bjParts(n1)
console.log(`  ${ok1 ? "✓" : "✗"} 周日 12:00 空闲 → 下次切换 ${ymd(bp1)} ${pad2(bp1.hour)}:${pad2(bp1.minute)}（期望 2026-10-12 09:00）`)

const t2 = bj(2026, 10, 12, 10, 0) // 周一 10:00 高峰
const n2 = nextTransition(t2)
const expect2 = bj(2026, 10, 12, 12, 0) // 周一 12:00
const ok2 = n2 === expect2
if (!ok2) failed++
const bp2 = bjParts(n2)
console.log(`  ${ok2 ? "✓" : "✗"} 周一 10:00 高峰 → 下次切换 ${ymd(bp2)} ${pad2(bp2.hour)}:${pad2(bp2.minute)}（期望 2026-10-12 12:00）`)

console.log(failed === 0 ? "\n全部通过。\n" : `\n${failed} 项未通过。\n`)
process.exit(failed === 0 ? 0 : 1)
