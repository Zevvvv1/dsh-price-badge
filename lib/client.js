window.__ModuleLoader__.load({ id: "dsh-price-badge", factory: (require) => {
  var module = { exports: {} }
  var React = require("react")

  // ── 价格与时段数据 ──────────────────────────────────────────────────────
  // 数据来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
  // 本次口径对应 2026-09-10 DeepSeek-V4.1-Flash 上线时的降价（官方更新日志）。
  // 该口径已生效，因此不再维护"生效前"状态；价格变动时直接改这里与 MODELS。
  var PRICING_LABEL = "2026-09-10"

  // 高峰时段（北京时间，UTC+8）：周一至周五 9:00–12:00、14:00–18:00 两个区间。
  // 中国不实行夏令时，固定 +8。
  var PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]

  // 官方口径：高峰为「北京时间周一至周五（不含中国法定节假日）」。因此
  //    · 周六、周日全天      → 空闲
  //    · 法定节假日全天      → 空闲
  //    · 法定调休上班日（官方安排为周六/周日上班）→ 属工作日，算高峰
  // 下列日期依《国务院办公厅关于2026年部分节假日安排的通知》国办发明电〔2025〕7 号。
  var HOLIDAYS = [
    "2026-01-01", "2026-01-02", "2026-01-03",                 // 元旦
    "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18",   // 春节
    "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22",
    "2026-02-23",
    "2026-04-04", "2026-04-05", "2026-04-06",                 // 清明节
    "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04",   // 劳动节
    "2026-05-05",
    "2026-06-19", "2026-06-20", "2026-06-21",                 // 端午节
    "2026-09-25", "2026-09-26", "2026-09-27",                 // 中秋节
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",   // 国庆节
    "2026-10-05", "2026-10-06", "2026-10-07"
  ]
  // 调休上班日（周六/周日上班）：不是节假日，按工作日参与峰谷判定。
  var MAKEUP_WORKDAYS = ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]
  // 节假日表的有效期上界：国务院通常在上一年 11 月发布次年安排。
  var CALENDAR_VALID_TO = "2026-12-31"

  // 官方人民币定价（元 / 每百万 tokens）：[输入·缓存命中, 输入·缓存未命中, 输出]
  var MODELS = [
    {
      name: "deepseek-flash", version: "DeepSeek-V4.1-Flash", short: "v4.1-flash",
      off: [0.02, 1, 4], peak: [0.04, 2, 8]
    },
    {
      name: "deepseek-v4-pro", version: "DeepSeek-V4-Pro-0813", short: "v4-pro",
      off: [0.15, 4.5, 13.5], peak: [0.3, 9, 27]
    }
  ]

  // ── 时间与峰谷判定（全部按北京时间） ────────────────────────────────────
  var BJ_OFFSET = 8 * 3600 * 1000

  function bjParts(ts) {
    var d = new Date(ts + BJ_OFFSET) // 位移后按 UTC 读，得到北京时间各字段
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      weekday: d.getUTCDay() // 0=周日 … 6=周六
    }
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n }
  function ymd(p) { return p.y + "-" + pad2(p.m) + "-" + pad2(p.day) }
  function bjMinuteOfDay(p) { return p.hour * 60 + p.minute }

  // 中国法定节假日 / 调休上班日查询表（仅加载一次）
  var HOLIDAY_SET = (function () {
    var s = {}
    for (var i = 0; i < HOLIDAYS.length; i++) s[HOLIDAYS[i]] = 1
    return s
  })()
  var MAKEUP_SET = (function () {
    var s = {}
    for (var i = 0; i < MAKEUP_WORKDAYS.length; i++) s[MAKEUP_WORKDAYS[i]] = 1
    return s
  })()
  var CALENDAR_EXPIRED = (function () {
    return ymd(bjParts(Date.now())) > CALENDAR_VALID_TO
  })()

  function isWorkday(p) {
    var key = ymd(p)
    if (HOLIDAY_SET[key] === 1) return false          // 法定节假日 → 空闲
    if (MAKEUP_SET[key] === 1) return true            // 调休上班日 → 工作日
    return p.weekday >= 1 && p.weekday <= 5           // 周一至周五
  }

  function isPeakAt(ts) {
    var p = bjParts(ts)
    if (!isWorkday(p)) return false
    var m = bjMinuteOfDay(p)
    for (var i = 0; i < PEAK_WINDOWS.length; i++) {
      if (m >= PEAK_WINDOWS[i][0] && m < PEAK_WINDOWS[i][1]) return true
    }
    return false
  }
  // 状态：1=空闲，2=高峰
  function stateOf(ts) {
    return isPeakAt(ts) ? 2 : 1
  }

  // 扫描状态翻转点，得到下一次切换的时刻（按 15 分钟步长，最多看 21 天）
  function nextTransition(from, stateFn, stepMs, horizonMs) {
    var cur = stateFn(from)
    var STEP = stepMs === undefined ? 15 * 60 * 1000 : stepMs
    var HORIZON = horizonMs === undefined ? 21 * 24 * 60 * 60 * 1000 : horizonMs
    for (var t = from + STEP; t <= from + HORIZON; t += STEP) {
      if (stateFn(t) !== cur) return t
    }
    return null
  }

  function fmtCountdown(ms) {
    if (ms <= 0) return "即将切换"
    var mins = Math.round(ms / 60000)
    var d = Math.floor(mins / 1440)
    var h = Math.floor((mins % 1440) / 60)
    var m = mins % 60
    if (d > 0) return d + " 天 " + h + " 小时后"
    if (h > 0) return h + " 小时 " + m + " 分后"
    return m + " 分钟后"
  }

  function fmtRmb(n) {
    var s = n.toFixed(2)
    if (n >= 1 && s.indexOf(".") >= 0) s = s.replace(/0$/, "").replace(/\.$/, "")
    return "¥" + s
  }

  // ── 样式 ────────────────────────────────────────────────────────────────
  var CSS = [
    ".dspx-badge{position:fixed;right:14px;bottom:14px;z-index:9999;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;line-height:1;cursor:pointer;border:1px solid rgba(127,127,127,.25);background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.12)));color:var(--dsw-alias-label-primary,inherit);box-shadow:var(--dsw-shadow-lv1,0 1px 4px rgba(0,0,0,.18));pointer-events:auto;user-select:none;font-family:inherit}",
    ".dspx-dot{width:8px;height:8px;border-radius:50%;flex:none}",
    ".dspx-off .dspx-dot{background:#34c759}.dspx-peak .dspx-dot{background:#ff9f0a}",
    ".dspx-card{position:fixed;right:14px;bottom:52px;z-index:9999;width:400px;max-width:calc(100vw - 28px);max-height:calc(100vh - 80px);overflow:auto;padding:14px 16px;border-radius:14px;font-size:12px;line-height:1.6;background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.16)));border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.25));box-shadow:var(--dsw-shadow-lv2,0 6px 24px rgba(0,0,0,.35));color:var(--dsw-alias-label-primary,inherit);pointer-events:auto;font-family:inherit}",
    ".dspx-card h3{margin:0 0 8px;font-size:13px;display:flex;justify-content:space-between;align-items:center}",
    ".dspx-card table{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed}",
    ".dspx-card th,.dspx-card td{padding:4px 6px;text-align:right;border-bottom:1px solid rgba(127,127,127,.15);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".dspx-card th:first-child,.dspx-card td:first-child{text-align:left;width:30%}",
    ".dspx-card th{color:var(--dsw-alias-label-secondary,inherit);font-weight:600}",
    ".dspx-offrow td{color:var(--dsw-alias-state-success-primary,#34c759)}",
    ".dspx-tag{font-size:10px;opacity:.75;margin-left:4px}",
    ".dspx-close{border:none;background:transparent;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:14px;line-height:1;padding:2px 6px;border-radius:6px}",
    ".dspx-close:hover{background:rgba(127,127,127,.15)}",
    ".dspx-note{margin-top:8px;color:var(--dsw-alias-label-tertiary,inherit);font-size:11px;line-height:1.5}",
    ".dspx-warn{margin-top:8px;color:var(--dsw-alias-state-warning-primary,#ff9f0a);font-size:11px;line-height:1.5}"
  ].join("\n")

  function injectCss() {
    if (typeof document === "undefined") return
    if (document.querySelector('style[data-plugin-css="dsh-price-badge/css"]') !== null) return
    var tag = document.createElement("style")
    tag.dataset.pluginCss = "dsh-price-badge/css"
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  // ── 插件装配 ────────────────────────────────────────────────────────────
  function apply(ctx) {
    var slots = ctx.get("slots")
    if (slots === undefined) return
    injectCss()

    function PriceBadge() {
      var nowState = React.useState(Date.now())
      var now = nowState[0]
      var setNow = nowState[1]
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]

      React.useEffect(function () {
        var dispose = ctx.interval(function () { setNow(Date.now()) }, 30000)
        // 从后台切回时立即刷新，避免长时间节流后徽章过时
        var onVisible = function () {
          if (typeof document !== "undefined" && !document.hidden) setNow(Date.now())
        }
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible)
        return function () {
          dispose()
          if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible)
        }
      }, [])

      var state = stateOf(now)
      var badgeText, badgeCls
      if (state === 2) { badgeText = "现在：高峰 · 全价"; badgeCls = "dspx-badge dspx-peak" }
      else { badgeText = "现在：空闲 · 5折"; badgeCls = "dspx-badge dspx-off" }

      var badge = React.createElement("div", {
        className: badgeCls,
        onClick: function () { setOpen(!open) },
        title: "DeepSeek 费用时段（点击展开）"
      },
        React.createElement("span", { className: "dspx-dot" }),
        badgeText
      )

      if (!open) return badge

      var bj = bjParts(now)
      var next = nextTransition(now, stateOf)
      var nextText = next === null ? "—" : fmtCountdown(next - now)

      var rows = []
      MODELS.forEach(function (m) {
        rows.push(React.createElement("tr", { key: m.name + "-off", className: "dspx-offrow" },
          React.createElement("td", { title: m.name + "（" + m.version + "）" },
            m.short, React.createElement("span", { className: "dspx-tag" }, "空闲·5折")),
          React.createElement("td", null, fmtRmb(m.off[0])),
          React.createElement("td", null, fmtRmb(m.off[1])),
          React.createElement("td", null, fmtRmb(m.off[2]))
        ))
        rows.push(React.createElement("tr", { key: m.name + "-peak" },
          React.createElement("td", { title: m.name + "（" + m.version + "）" },
            m.short, React.createElement("span", { className: "dspx-tag" }, "高峰·全价")),
          React.createElement("td", null, fmtRmb(m.peak[0])),
          React.createElement("td", null, fmtRmb(m.peak[1])),
          React.createElement("td", null, fmtRmb(m.peak[2]))
        ))
      })

      var children = [
        React.createElement("h3", { key: "h" },
          React.createElement("span", null, "DeepSeek 费用时段"),
          React.createElement("button", { className: "dspx-close", onClick: function () { setOpen(false) } }, "\u2715")
        ),
        React.createElement("div", { key: "now" },
          "当前北京时间：", ymd(bj), " " + pad2(bj.hour) + ":" + pad2(bj.minute),
          bj.weekday === 0 ? "（周日）" : bj.weekday === 6 ? "（周六）" : "（周" + "一二三四五".charAt(bj.weekday - 1) + "）"
        ),
        React.createElement("div", { key: "nx" }, "距离下次切换：", nextText),
        React.createElement("div", { key: "w1" }, "高峰时段：周一至周五 9:00\u201312:00、14:00\u201318:00（北京时间）"),
        React.createElement("div", { key: "w2" }, "空闲时段：其余时间，含周末与中国法定节假日全天；价格 = 高峰一半"),
        React.createElement("table", { key: "t" },
          React.createElement("thead", null,
            React.createElement("tr", null,
              React.createElement("th", null, "模型"),
              React.createElement("th", { title: "输入 token（缓存命中）" }, "输入·命中"),
              React.createElement("th", { title: "输入 token（缓存未命中）" }, "输入·未命中"),
              React.createElement("th", { title: "输出 token" }, "输出")
            )
          ),
          React.createElement("tbody", null, rows)
        ),
        React.createElement("div", { className: "dspx-note", key: "src" },
          "官方人民币定价（元 / 每百万 tokens），价格口径 " + PRICING_LABEL + "。旧模型名 deepseek-v4-flash 已下线，请求按 Flash 价格计费。"
        )
      ]
      if (CALENDAR_EXPIRED) {
        children.push(React.createElement("div", { className: "dspx-warn", key: "cal" },
          "⚠ 节假日表仅覆盖至 " + CALENDAR_VALID_TO + "，当前已超出：法定节假日全天按空闲计价这一条可能不准，请更新 holidays。"
        ))
      }

      var card = React.createElement("div", { className: "dspx-card" }, children)
      return React.createElement(React.Fragment, null, badge, card)
    }

    slots.inject("shell.overlay", function () {
      return slots.register(
        { name: "shell.overlay", id: "deepseek-price-badge", order: 100 },
        PriceBadge
      )
    })
  }

  module.exports = { apply: apply, inject: ["timer"] }
  return module.exports
}})
