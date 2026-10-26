# 史地 UI 设计规范(Europa 羊皮纸/宫廷风)

> 2026-10-23 方向切换:自「夜间卫星地面站」换装为 Europa 令牌体系(源 `design/tokens/`,规范 `design/docs/SPEC.md`)。
> 约束不变:零新增运行时依赖;CSS 自定义属性 + 系统字体栈;单列移动优先。
> 令牌唯一真源是 `design/tokens/*.json`,`src/app/tokens.css` 与 `src/lib/map-tokens.ts` 均为生成物(`npm run tokens`),勿手改。

## 1. 主题与氛围

历史策略游戏的档案美学。应用主题 **court(宫廷藏青)**:选点、确认、遥测是深夜书房里的仪器盘;研究完成后切入 **atlas(羊皮纸)** 档案模式:一张金线装裱的方志图版从藏青底上浮现。反差即记忆点——从「检索的仪器」到「成文的档案」。

`<html data-theme="court">` 全局挂载(layout.tsx);`ReportView` 内部自挂 `data-theme="atlas"`(研究页/分享页共用,页面外壳保持 court)。CSS 变量按 `[data-theme]` 作用域级联,组件永远只吃语义/组件令牌,不碰原始色板。

## 2. 色彩(令牌,勿写裸色值)

真源:`design/tokens/primitives.json`(色板)+ `themes/atlas.json`、`themes/court.json`(语义分配)。常用变量速查(值由 JSON 生成,以 tokens.css 为准):

| 令牌 | court(应用) | atlas(报告) | 用途 |
|---|---|---|---|
| --bg-canvas | #18242E | #D9CBAA | 页面画布 |
| --bg-surface | #243748 | #F0E5CC | 面板/图版 |
| --bg-elevated | #304454 | #FBF6EB | 弹窗/抬升 |
| --text-primary | #F0E5CC | #382C22 | 主文本 |
| --text-secondary | #C0D0DC | #514233 | 次文本 |
| --text-tertiary | #93A8BA | #5E5039 | 弱化标签 |
| --text-link | #A9CBE4 | #365A78 | 链接/引注 |
| --border-default / --border-subtle | #526575 / #354B5B | #B8A47C / #D9CBAA | 描边/分隔 |
| --border-accent | #C6A15B | #C6A15B | 金:唯一强调色(≤10% 视觉权重) |
| --action-primary(-hover/-active/-text) | #C6A15B 系 | #772F35 系 | 主按钮 |
| --status-success/warning/danger/info(+ -bg) | 成对定义 | 成对定义 | 状态前景/底色 |

60-30-10:藏青/羊皮纸底 60,次文本与描边 30,金 ≤10。对比度是硬门槛:`tests/tokens.test.ts` 按 WCAG AA(正文 4.5:1、焦点环 3:1)逐对校验双主题,改色必须先过测试。校准记录:draft 色板的 atlas 次文本/弱文本与 court 弱文本不达标,已补 ink.350(#5E5039)、navy.150(#93A8BA)中间档并改由主题引用(SPEC 允许,palette 本就是提案)。

## 3. 字体(系统栈,无外部字体)

- UI:`--font-body`(-apple-system/PingFang SC 系)
- 遥测/数据:`--font-mono`(计数 `font-variant-numeric: tabular-nums`)
- 标题/报告正文:`--font-display`(Georgia/Noto Serif SC/Songti 衬线)
- 字阶令牌:12(xs)/14(sm)/16(md)/20(lg)/24(xl)/32(display)。已文档化例外:正文 15px(中文密度调校)、17/19/26/44px 等个别调校值。display 级负字距 -0.012~-0.022em;页头 wordmark 反向 0.32em 大字距(铭刻感)。

## 4. 组件

- 按钮:圆角 `--button-radius`(3px,雕版直角感);主按钮 = 实心(court 金底藏青字 / atlas 勃艮第底白字)+ hover/active 变深浅;次按钮 = 透明底 + `--border-default` 描边;active `scale(0.97)`;最小命中 44px(`--control-height-lg`)。
- 输入:`--input-bg` 底 + `--input-border` 描边,聚焦换 `--focus-ring` 描边并外扩 2px 实心环。
- 弹窗:`--dialog-*` 契约,金色钥匙线描边(`--dialog-border` = accent),`--dialog-radius`(10px)+ `--dialog-shadow`。
- 面板:`--panel-*` 契约;等宽遥测行首 4px 状态点(金 = 检索、琥珀 = 阶段/稀缺、红 = 失败),逐条滑入。
- 报告图版 `.archive`:atlas 作用域,`--bg-surface` 羊皮纸底 + 金色 1px 装裱线 + `--shadow-panel`,衬线正文;`h2` 下沿金线;引注 `.cite` 用 `--text-link`(蓝墨水批注感)。
- 状态徽章/横幅:一律 `--status-*` 前景/底色成对使用,不用半透明 opacity 造残色。

## 5. 布局

- 首页单列最大宽 720px 居中;报告/分享页 860px(`.shell-wide`)。
- 节奏 4px 基数,间距优先取 `--space-*` 令牌;标题区上 32/下 24;正文行高 1.75(衬线报告 1.95);段落宽 ≤ 68ch。

## 6. 深度

court:藏青实色阶梯(canvas → surface → elevated)+ 描边承担轮廓,阴影仅辅助;atlas:浅色下用真实阴影(`--shadow-panel/popover/modal`)+ 描边。层级一律 `--layer-*` 令牌,不发明散装 z-index。

## 7. Do / Don't

- Do:金色只做强调(状态点、装裱线、选中描边、流式光标);数据右对齐 tabular-nums;错误文案说人话;改令牌先跑 `npm run tokens` + `npm test`(生成物与源同步是测试项)。
- Don't:组件里写裸 hex(只允许 tokens.css/map-tokens.ts 生成物与极少数文档化字面量,如弹窗遮罩 rgba);`transition: all`;border-left 彩条;渐变文字/毛玻璃/青紫色系;把金当普通底色大面积铺。

## 8. 响应式

断点 720px;移动端触控目标 ≥44px;`touch-action: manipulation`;安全区 `env(safe-area-inset-*)`;悬停态全部包 `@media (hover: hover)`。

## 9. 动效

- 缓动 `--ease-standard`(cubic-bezier(0.2,0,0,1)),时长 `--duration-fast/normal/slow`(120/180/240ms);只动 transform/opacity。
- 流式光标 ▌ 金色 0.9s steps(2);事件行 translateY(6px→0) 140ms 滑入;状态点脉冲用 `--map-overlay-selection`。
- `prefers-reduced-motion` 全关。

## 10. 令牌工作流(换装后新增)

- 改色/改尺度 → 编辑 `design/tokens/**.json` → `npm run tokens` → `npm test`(引用完整性、双主题路径对齐、生成物同步、对比度全部是断言)→ 提交 JSON 与生成物。
- 地图画布色:globe 用 `src/lib/map-tokens.ts` 的 `GLOBE`(maplibre paint 不解析 CSS 变量);CSS 侧同值走 `--bg-navigation`。
- 主题契约:atlas 与 court 必须暴露同名语义路径(SPEC §5);两主题均已接入(court = 应用外壳,atlas = 报告图版)。
