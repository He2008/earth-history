# D4 · 日志与可观测约定

> 版本 v1(2026-10-23)· 状态:**待确认** · 兑现 TDD §12「结构化 stdout 日志」承诺,细则以本文为准
> 范围:M1 内测够用;日志采集/轮转/告警明确不做(PREP §5「不提前搭监控」继续有效)

---

## 1. 三层数据的分工(原则)

| 层 | 载体 | 角色 | 保留策略 |
|---|---|---|---|
| **事实来源** | SQLite(research_tasks / sources) | 任务复盘的权威数据:timeline、cost、timings、终稿 | 随 DB |
| **运维窗口** | stdout 结构化事件日志(本文) | 回答"当时服务端发生了什么":降级、重试、熔断、抓取失败、清扫 | 进程接管(nohup/journald) |
| **实时 UI** | SSE 事件(bus) | 只服务在线客户端,断线即弃,**不承担留存职责** | 会话级 |

边界规则:**DB 已有的数据不重复进日志**(done 事件带 cost 摘要属例外,便于 grep);**日志不写文件**(stdout 是唯一出口,部署层重定向);**SSE 高频事件(content)永不进日志**。

## 2. 事件信封

一行一个 JSON 对象,UTF-8,直写 `process.stdout`(不用 console 的多参格式):

```json
{"ts":1792740000000,"level":"info","event":"search.round","taskId":"aB3xKz","round":1,"engine":"deepseek","found":29,"keptNew":24}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| ts | number | ✓ | Date.now(),毫秒 |
| level | enum | ✓ | `debug \| info \| warn \| error` |
| event | string | ✓ | 点分命名,见 §3 清单 |
| taskId | string | — | 任务上下文事件必填;全局事件(boot/sweep)无此字段 |
| *(其余) | any | — | 各事件专属字段,值必须是可 JSON 序列化的原始类型 |

降噪规则:错误对象压成 `err: String(e.message)` 单行,**禁止打印多行 stack**(崩溃类问题由 macOS .ips / Node diagnostic report 承担);URL 记 `url_norm`(去追踪参数),不记 snippet/正文。

## 3. 事件清单(埋点即契约)

### 3.1 由 bus 白名单转发(实现集中在 `events.ts` 一处,不逐点埋)

| event | level | 来源事件 | 专属字段 |
|---|---|---|---|
| phase | info | progress | phase, round?, note |
| search.round | info | search_hit | round, query, engine, found, keptNew |
| task.done | info | done | status, elapsedMs, sourcesKept, yuan |
| task.fail | error | error | code, retryable |

不转发:`task_created`(由 task.start/cache_hit 覆盖)、`content`(高频)、`sources`(DB 有)、`continue_polling`。

### 3.2 手工埋点

| event | level | 位置 | 触发 | 专属字段 |
|---|---|---|---|---|
| task.start | info | pipeline.startResearch | 新任务真正起跑 | place, direction |
| task.cache_hit | info | pipeline.startResearch | 30 天缓存命中回放(成本 0) | place, direction |
| fetch.fail | warn | pipeline.ts fetching else 分支 | 单 URL 抓取失败(当前被静默丢弃) | idx, url, reason(robots/http_403/not_html/error) |
| fetch.summary | info | pipeline.ts fetching 结束 | 每任务抓取汇总 | ok, fail, reasons(计数字典) |
| citations.invalid | warn | pipeline.ts 引用校验后 | 剔除幻觉引用 >0 | invalidCount |
| search.degrade | warn | search/chain.ts catch | 某引擎失败换下一家 | engine, err |
| search.all_failed | error | search/chain.ts 抛错前 | 全链失败 | tried[] |
| llm.degrade | warn | llm/chain.ts catch | 重试/换家(当前无 taskId,见 §5) | provider, attempt, err |
| circuit.open | warn | 两条 chain | 同家连续 3 失败熔断 5min | provider, retryAt |
| sweep.stale | warn | repo.ensureLifecycle | 启动清扫僵尸任务 | count |
| server.boot | info | repo.ensureLifecycle | 首次 getRepo(进程唯一入口) | node, pid, dbPath |
| sse.client_abort | debug | api/research/route.ts abort | 客户端断开 SSE | — |

合计:任务全程 info ≈ 10-15 行,debug 关闭时单任务日志量 < 2KB。

## 4. 级别与开关

| 级别 | 语义 |
|---|---|
| debug | 单条明细(客户端断流等),默认关 |
| info | 任务生命周期正常轨迹 |
| warn | 降级/重试/失败但已兜底——**内测排障最常用,grep warn 起手** |
| error | 终态失败(任务失败、全链失败) |

- 环境变量 `SHIDI_LOG_LEVEL=debug|info|warn|error`,默认 `info`
- `NODE_ENV=test` 一律静默(与信号处理器同一守卫,测试里用注入捕获断言)

## 5. 归因的已知缺口(接受,不为此加复杂度)

- chain 层(search/llm)拿不到 taskId:单机低并发,`llm.degrade`/`search.degrade` 暂不归因到任务;需要时按时间戳与相邻 task.start 对齐。P1 若给 `SearchOpts`/`LlmRequest` 加透传字段再升级,**本次不做**。
- `>20% 无效引用` quality flag:除 citations.invalid 日志外,同步在 finish 的 timeline 追加一条(顺手修 Backlog「盲评看不到」项)。
- 请求访问日志:Next 生产模式自带请求行,不重复造。

## 6. 实现与验收

- 新增单文件 `src/server/obs/log.ts`(≈40 行):`log.info/warn/error/debug(event, fields)`,级别过滤 + JSON 序列化 + test 静默;bus 白名单转发在 `events.ts` 的 `emit` 内挂 3 行
- 落库配合:fetch else 分支同时把失败汇总 append 进 timeline(`第 N 轮抓取:ok X / fail Y(robots:2)`);catch 路径 append 一条 `{phase:'failed', note:error_code}`(修 Backlog「失败任务 timeline 无错误」)
- 测试:`tests/log.test.ts` 断言 ①级别过滤 ②bus 白名单转发与 content 排除 ③fetch.fail 在失败 URL 时发出
- 验收:生产模式跑 1 次研究,`server.log` 出现 §3 全部事件、单任务 < 2KB、`grep '"level":"warn"' server.log` 能回答"有没有降级"

## 7. 明确不做(P1 再议)

日志文件轮转与采集、research_events 表、指标导出、告警、trace id 贯穿、LLM 逐 token 计量。
