# 史地 UI 设计规范(卫星暗色风)

> 2026-10-23 方向锁定:P0 无地图链路。视觉母题:夜间卫星地面站(night ground station)。
> 约束:零新增依赖(无 Tailwind/字体包),单文件全局 CSS + CSS 自定义属性(OKLCH),系统字体栈。

## 1. 主题与氛围
夜间地面站接收任务简报:页面是深黑绿的仪器面板,等宽字体承载遥测数据;研究完成后视图切入衬线档案排版,像从下行链路里打印出的一份方志。反差即记忆点。

## 2. 色彩(OKLCH)
| 令牌 | 值 | 用途 |
|---|---|---|
| --bg | oklch(0.145 0.008 160) | 页面画布(近黑,微绿) |
| --surface-1 | rgba(255,255,255,0.025) | 嵌入面板 |
| --surface-2 | rgba(255,255,255,0.045) | 抬升面板(弹窗/报告) |
| --line | rgba(255,255,255,0.07) | 分隔线/描边 |
| --line-strong | rgba(255,255,255,0.12) | 输入框/悬停描边 |
| --text-1 | oklch(0.93 0.005 160) | 主文本(禁纯白) |
| --text-2 | oklch(0.68 0.01 160) | 次要文本 |
| --text-3 | oklch(0.52 0.01 160) | 弱化标签 |
| --accent | oklch(0.8 0.155 152) | 信号绿:状态点/进度/主按钮描边 |
| --accent-dim | oklch(0.8 0.155 152 / 0.14) | 信号绿底纹 |
| --warn | oklch(0.78 0.125 80) | 琥珀:稀缺/部分失败 |
| --danger | oklch(0.68 0.19 25) | 错误/失败 |
60-30-10:画布与面板 60,次要文本与分隔 30,信号绿 ≤10。禁青紫渐变、禁 border-left 彩条。

## 3. 字体(系统栈,无外部字体)
- UI:`system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
- 遥测/数据:`ui-monospace, "SF Mono", Menlo, Consolas, monospace`(计数用 `font-variant-numeric: tabular-nums`)
- 报告正文(档案感):`Georgia, "Songti SC", "STSong", SimSun, serif`
- 字阶:12/13(标签)、15(正文 UI)、18(节标题)、26(页题);display 级 26px 以上 -0.022em。

## 4. 组件
- 按钮:圆角 6px;主按钮=透明底+信号绿描边+绿字,悬停 surface-1 底,active `scale(0.97)`;次按钮=灰描边。最小命中 40×40。
- 输入:透明底,--line-strong 1px 描边,聚焦信号绿描边+外发光 2px。
- 列表项:悬停 surface-1,无卡片阴影;分隔用 1px --line。
- 弹窗(F3.1 确认):surface-2 面板+ --line 描边+ `overscroll-behavior: contain`,Esc 关闭。
- 遥测行:等宽 13px,行首 4px 状态点(绿=进行,琥珀=稀缺,红=失败),逐条 `translateY(6px)→0` 滑入。

## 5. 布局
- 首页单列最大宽 720px 居中;研究页遥测面板与报告同列纵向切换(移动优先)。
- 节奏:8px 基数;标题区上 32/下 24;正文行高 1.75(衬线报告 1.9);段落宽 ≤ 68ch。

## 6. 深度
暗色下阴影不可见,一律用白色叠加阶梯(canvas → 0.025 → 0.045)表达层级;描边 --line 兜底。

## 7. Do / Don't
- Do:状态点+短横线替代彩条;数据右对齐 tabular-nums;错误文案说人话(「搜索链路全部失败,稍后重试」)。
- Don't:感叹号;渐变文字;毛玻璃;`transition: all`;青紫色系;三栏等距卡片阵列。

## 8. 响应式
断点 720px;移动端触控目标 ≥44px;`touch-action: manipulation`;安全区 `env(safe-area-inset-*)`。

## 9. 动效
- 缓动统一 `cubic-bezier(0.16,1,0.3,1)`;只动 transform/opacity。
- 流式光标:400ms steps(2) 闪烁的 ▌;`prefers-reduced-motion` 全关。
- 事件行进入:opacity 0→1 + translateY(6px→0),120ms;新行错峰 60ms。
