window.__ModuleLoader__.load({ id: "dsh-price-badge", factory: (require) => {
  var module = { exports: {} }
  var React = require("react")

  // ── data ────────────────────────────────────────────────────────────────
  // 生效时间：2026-08-16 16:00 UTC = 北京时间 8/17 00:00
  var EFFECTIVE_TS = Date.UTC(2026, 7, 16, 16, 0, 0)
  // 高峰时段（北京时间）：9:00-12:00、14:00-18:00
  var WINDOWS = [[9, 12], [14, 18]]
  // 官方人民币定价（元 / 百万 tokens）：[缓存命中输入, 未命中输入, 输出]
  var MODELS = [
    { name: "deepseek-v4-flash", short: "v4-flash", off: [0.05, 1.5, 4.5], peak: [0.1, 3.0, 9.0] },
    { name: "deepseek-v4-pro", short: "v4-pro", off: [0.15, 4.5, 13.5], peak: [0.3, 9.0, 27.0] }
  ]

  function beijingHour() {
    return new Date(Date.now() + 8 * 3600 * 1000).getUTCHours()
  }
  function isPeakNow() {
    var h = beijingHour()
    return WINDOWS.some(function (w) { return h >= w[0] && h < w[1] })
  }
  function fmtRmb(n) {
    var s = n.toFixed(2)
    if (n >= 1 && s.indexOf(".") >= 0) s = s.replace(/0$/, "").replace(/\.$/, "")
    return "¥" + s
  }

  // ── styles ──────────────────────────────────────────────────────────────
  var CSS = [
    ".dspx-badge{position:fixed;right:14px;bottom:14px;z-index:9999;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;line-height:1;cursor:pointer;border:1px solid rgba(127,127,127,.25);background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.12)));color:var(--dsw-alias-label-primary,inherit);box-shadow:var(--dsw-shadow-lv1,0 1px 4px rgba(0,0,0,.18));pointer-events:auto;user-select:none;font-family:inherit}",
    ".dspx-dot{width:8px;height:8px;border-radius:50%;flex:none}",
    ".dspx-off .dspx-dot{background:#34c759}.dspx-peak .dspx-dot{background:#ff9f0a}.dspx-preview .dspx-dot{background:#0a84ff}",
    ".dspx-card{position:fixed;right:14px;bottom:52px;z-index:9999;width:390px;max-width:calc(100vw - 28px);padding:14px 16px;border-radius:14px;font-size:12px;line-height:1.6;background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.16)));border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.25));box-shadow:var(--dsw-shadow-lv2,0 6px 24px rgba(0,0,0,.35));color:var(--dsw-alias-label-primary,inherit);pointer-events:auto;font-family:inherit}",
    ".dspx-card h3{margin:0 0 8px;font-size:13px;display:flex;justify-content:space-between;align-items:center}",
    ".dspx-card table{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed}",
    ".dspx-card th,.dspx-card td{padding:4px 6px;text-align:right;border-bottom:1px solid rgba(127,127,127,.15);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".dspx-card th:first-child,.dspx-card td:first-child{text-align:left;width:32%}",
    ".dspx-card th{color:var(--dsw-alias-label-secondary,inherit);font-weight:600}",
    ".dspx-offrow td{color:var(--dsw-alias-state-success-primary,#34c759)}",
    ".dspx-tag{font-size:10px;opacity:.75;margin-left:4px}",
    ".dspx-close{border:none;background:transparent;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:14px;line-height:1;padding:2px 6px;border-radius:6px}",
    ".dspx-close:hover{background:rgba(127,127,127,.15)}",
    ".dspx-note{margin-top:8px;color:var(--dsw-alias-label-tertiary,inherit);font-size:11px;line-height:1.5}"
  ].join("\n")

  function injectCss() {
    if (typeof document === "undefined") return
    if (document.querySelector('style[data-plugin-css="dsh-price-badge/css"]') !== null) return
    var tag = document.createElement("style")
    tag.dataset.pluginCss = "dsh-price-badge/css"
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  // ── plugin ──────────────────────────────────────────────────────────────
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
        var dispose = ctx.interval(function () { setNow(Date.now()) }, 60000)
        // 页面从后台切回时立即刷新，避免长时间节流后徽章过时
        var onVisible = function () {
          if (typeof document !== "undefined" && !document.hidden) setNow(Date.now())
        }
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible)
        return function () {
          dispose()
          if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible)
        }
      }, [])

      var effective = now >= EFFECTIVE_TS
      var peak = effective && isPeakNow()
      var badgeText, badgeCls
      if (!effective) { badgeText = "8/17 起峰谷定价 · 空闲5折"; badgeCls = "dspx-badge dspx-preview" }
      else if (peak) { badgeText = "现在：高峰 · 全价"; badgeCls = "dspx-badge dspx-peak" }
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

      var rows = []
      MODELS.forEach(function (m) {
        rows.push(React.createElement("tr", { key: m.name + "-off", className: "dspx-offrow" },
          React.createElement("td", { title: m.name }, m.short, React.createElement("span", { className: "dspx-tag" }, "空闲·5折")),
          React.createElement("td", null, fmtRmb(m.off[0])),
          React.createElement("td", null, fmtRmb(m.off[1])),
          React.createElement("td", null, fmtRmb(m.off[2]))
        ))
        rows.push(React.createElement("tr", { key: m.name + "-peak" },
          React.createElement("td", { title: m.name }, m.short, React.createElement("span", { className: "dspx-tag" }, "高峰·全价")),
          React.createElement("td", null, fmtRmb(m.peak[0])),
          React.createElement("td", null, fmtRmb(m.peak[1])),
          React.createElement("td", null, fmtRmb(m.peak[2]))
        ))
      })

      var card = React.createElement("div", { className: "dspx-card" },
        React.createElement("h3", null,
          React.createElement("span", null, "DeepSeek 费用时段"),
          React.createElement("button", { className: "dspx-close", onClick: function () { setOpen(false) } }, "\u2715")
        ),
        React.createElement("div", null, "生效：2026-08-17 00:00（北京时间）起"),
        React.createElement("div", null, "高峰时段（北京时间）：9:00\u201312:00、14:00\u201318:00"),
        React.createElement("div", null, "空闲时段：其余时间，价格 = 高峰一半"),
        React.createElement("table", null,
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
        React.createElement("div", { className: "dspx-note" }, "官方人民币定价：每百万 tokens（元）")
      )

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
