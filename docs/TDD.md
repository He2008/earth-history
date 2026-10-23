# 技术设计文档(TDD)

> 配套 `PRD.md`(v0.1)使用 · 版本 v1(2026-10-22)· 覆盖 M0 编排器与 M1 P0 功能
> 原则:单实例、单进程、SQLite、零队列基础设施;一切长任务状态可从 DB 重建

---

## 1. 运行时与总体架构

- **Next.js 15(App Router)+ React 19 + TS strict**,`output: 'standalone'` 长驻 Node 进程部署(M0/M1 海外 VPS 或本地;SSE + 3 分钟长任务不支持 Serverless)
- **国内环境两条注意**:① npm 源配 npmmirror(`registry.npmmirror.com`),构建全程无海外依赖;② 字体走 `next/font/local` 自托管(Noto Sans SC,与 P1 PDF 导出共用同一份字体文件),禁用 `next/font/google`(构建时拉 Google Fonts,国内会卡死/失败)
- **编排器跑在进程内**:运行中任务注册在 `Map<taskId, PipelineHandle>`(支持 abort);DB 是唯一持久层,断线/刷新恢复全部走 DB
- **SQLite(better-sqlite3,同步 API)+ 手写迁移**;单实例写入无并发问题;后续迁 PG 只动 `repo` 层
- 新增依赖:`better-sqlite3`、`zod`(入参校验)、`maplibre-gl`、`nanoid`;readability 抓取自建

```
浏览器                          服务端(单进程)
┌──────────────┐  POST /api/research  ┌────────────────────────────┐
│ MapLibre 地球 │ ──────────────────→ │ orchestrator               │
│ + 研究面板    │ ←───── SSE 流 ────── │  machine/pipeline/citations│
└──────────────┘                     │  ├ search: DeepSeek→博查(降级链)│
  刷新/断线 → GET /:id、/:id/poll     │  ├ llm:    DeepSeek→智谱GLM │
                                     │  ├ fetch:  readability     │
                                     │  └ geocode:天地图→县界兜底  │
                                     │ db(SQLite):tasks/sources/cache│
                                     └────────────────────────────┘
```

## 2. 目录结构

```
src/
├─ app/
│  ├─ page.tsx                    # 地球 + 选点(F1/F2/F3.1/F8)
│  ├─ research/[id]/page.tsx      # 研究进度 + 报告页(刷新恢复 F3.2)
│  ├─ share/[token]/page.tsx      # 公开只读报告(F7)
│  └─ api/
│     ├─ geocode/route.ts               # GET 逆地理编码
│     ├─ research/route.ts              # POST 创建 + SSE
│     ├─ research/[id]/route.ts         # GET 全量恢复
│     ├─ research/[id]/poll/route.ts    # GET 短轮询
│     ├─ research/[id]/feedback/route.ts# POST 👍/👎
│     └─ share/[token]/route.ts
├─ server/
│  ├─ orchestrator/{machine,pipeline,citations,events}.ts
│  ├─ providers/search/{types,bocha,zhipu,chain}.ts
│  ├─ providers/llm/{types,deepseek,qwen,chain}.ts
│  ├─ providers/fetch/{fetcher,readability,robots}.ts
│  ├─ db/{schema,migrations,repo}.ts
│  └─ geocode/{tianditu,boundary}.ts    # boundary: 县界 point-in-polygon
├─ components/{globe,research-panel,report-view,history-list}.tsx
└─ lib/{types,config,cache-key}.ts
```

## 3. 编排器状态机

```
queued → planning → searching → fetching → synthesizing → completed
                                  ↓(kept 源 < 3)              ↘ scarce
任一非终态 ────────────────────────→ failed(超时/熔断/异常)
```

| 状态 | 职责 | 持久化 | 预算/超时 | 超时动作 |
|---|---|---|---|---|
| queued | 建行即返回 taskId | 全量初始字段 | <1s 被调度 | 启动清扫:首次 `getRepo()` 时把**所有**非终态行清为 failed(stale_task)——单进程重启后运行中任务必死,不做 5min 宽限 |
| planning | LLM 拆 5-8 子问题 | status/direction/extra/plan | 60s | 重试 1 次 → failed(llm) |
| searching | 4-6 轮自适应并行搜索 | 每轮:plan_json、sources(candidate/kept)、timeline | 单 query 15s;轮预算 45s;总 150s(软) | 单 query 换引擎重试 1 次;总超时带现有结果进 fetching |
| fetching | top≤12 URL 并发抓取(并发 4) | sources(fetched/fetched_chars/quote) | 单 URL 15s;总 60s(软) | 放弃该 URL,snippet 兜底 |
| synthesizing | 流式成文 + 引用校验 | report_md 每 ~2KB 增量落库 | 180s | 切备用 LLM 重试 1 次 → failed |
| completed | 终稿+来源列表+share_token | finished_at、cost/timings | — | — |
| scarce | kept<3 → 降级模板成文(区划沿革+地理背景) | 同 completed + scarcity 标记 | 90s | 同 synthesizing |
| failed | 错误终态 | error_code/error_msg | — | — |

- **任务硬上限 10 分钟**,由 startResearch 的看门狗强制(超时 `registry.abort(id)` → AbortError → failed(timeout))
- **timeline_json**:每次状态迁移/每轮搜索 append `{phase, round, note, ts}`;进度条与刷新恢复共用这一份
- **生命周期钩子懒安装**:不用 instrumentation.ts(Next 会把它编译到 edge 运行时,无法解析 better-sqlite3 的 require('fs'),曾致 dev 全路由 500);清扫+SIGTERM/SIGINT 改在 `getRepo()` 首次调用时安装(NODE_ENV=test 不装信号处理器)
- **服务重启不续跑**:shutdown 时 abort 运行中管线 → failed(interrupted, retryable);重试从头开始(M0 简化,单次成本 ≤¥0.25 可接受)

## 4. DB Schema(SQLite 三张表)

```sql
CREATE TABLE research_tasks (
  id            TEXT PRIMARY KEY,     -- nanoid(12)
  status        TEXT NOT NULL,        -- queued|planning|searching|fetching|synthesizing|completed|scarce|failed
  place_name    TEXT NOT NULL,        -- 展示名,如"云南省大理州云龙县诺邓村"
  place_json    TEXT NOT NULL,        -- {province,city,county,village?,source:'tianditu'|'boundary'|'research'}
  lat REAL NOT NULL, lng REAL NOT NULL,
  direction     TEXT NOT NULL,        -- F3.1 八个预设方向之一
  extra_instruction TEXT,
  plan_json     TEXT,                 -- string[] 子问题
  timeline_json TEXT NOT NULL DEFAULT '[]',
  report_md     TEXT DEFAULT '',      -- 合成中增量落库,终稿即此列
  share_token   TEXT UNIQUE,          -- completed/scarce 时生成
  error_code TEXT, error_msg TEXT,
  cost_json     TEXT,                 -- {searchCalls:{bocha:2,zhipu_std:1},llmTokens:{in,out},yuan:0.18}
  timings_json  TEXT,                 -- {planningMs,searchingMs,fetchingMs,synthesizingMs,totalMs}
  feedback      INTEGER,              -- 1|-1|NULL
  created_at INTEGER, updated_at INTEGER, finished_at INTEGER
);
CREATE INDEX idx_tasks_status ON research_tasks(status, updated_at);

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES research_tasks(id),
  idx   INTEGER,               -- kept 顺序编号 1..n,即引用编号
  stage TEXT NOT NULL,         -- candidate→kept→fetched→cited
  title TEXT, url TEXT, url_norm TEXT,  -- 归一化:去 utm/锚点、主机小写
  snippet TEXT, published_at TEXT,
  engine TEXT,                 -- bocha|zhipu_std|zhipu_pro|zhipu_sogou
  score REAL, fetched_chars INTEGER, quote TEXT  -- quote: 被引用原文句(核查用)
);
CREATE INDEX idx_sources_task ON sources(task_id, stage);

CREATE TABLE research_cache (
  cache_key TEXT PRIMARY KEY,  -- sha256(县级行政区归一化名 + round(lat,2) + round(lng,2) + direction)
  task_id   TEXT NOT NULL,     -- 指向已完成任务,回放其报告与来源
  created_at INTEGER, expires_at INTEGER  -- 30 天
);
```

- **事件不单独建表**:进度由 `research_tasks`(status/timeline/report_md)+ `sources` 重建;P1 研究日志面板需要更细轨迹时再加 `research_events`
- 抓取合规落库口径:只存摘要与被引单句(≤200 字 snippet / quote),不全文转载(PREP §4)

## 5. API 契约

错误统一 `{error:{code,message}}`;code ∈ `invalid_params | geocode_failed | search_all_failed | llm_all_failed | timeout | stale_task | not_found | internal`。

| 端点 | 方法 | 用途 | 请求 | 成功响应 |
|---|---|---|---|---|
| /api/geocode | GET | F2 逆地理编码 | `?lat=&lng=` | `{place:{province,city,county,village?},source}` |
| /api/research | POST | 创建任务,SSE 返回 | `{lat,lng,place,direction,extra?}` | `text/event-stream`(§6) |
| /api/research/:id | GET | 刷新恢复:全量 | — | `{task}`(status/plan/timeline/sources/report_md/scarcity/share_token) |
| /api/research/:id/poll | GET | SSE 断开后短轮询 | — | JSON 快照(下方) |
| /api/research/:id/feedback | POST | 满意度 | `{value:1\|-1}` | `{ok:true}` |
| /api/share/:token | GET | 公开只读报告 | — | `{place,direction,report_md,sources[],created_at,scarcity}`;无效 404 |

- **前端主流程**:点击 → `/api/geocode` → F3.1 确认弹窗(地名+方向+补充指令)→ `POST /api/research` 收 SSE;`task_created` 时把 taskId 写 localStorage 历史(F6)
- **缓存命中**:POST 算 cache_key 命中未过期 → 不跑管线不新建行,以原 taskId 发 `task_created{cached:true} + content(全量) + sources + done`(成本 0)
- zod 校验:lat∈[-90,90]、lng∈[-180,180]、direction 枚举、extra ≤200 字

**poll 响应**(3s 一次,终态即停):
```json
{"taskId":"aB3x","status":"searching","round":2,"timeline":[],"sourcesKept":5,
 "partialChars":0,"done":false,"continuePolling":true,"intervalMs":3000,
 "report":null,"sources":null}
```
终态时 `done:true` 并带回 `report / sources / scarcity` 全量。

## 6. SSE 事件协议

每条事件带自增 `id:`(调试用);恢复不依赖 Last-Event-ID,统一走 `GET /:id` 重建 + `/poll` 接力。每 15s 发注释心跳 `: ping` 防代理空闲断连。

| event | data 载荷 | 时机 |
|---|---|---|
| task_created | `{taskId, place, cached:false}` | 建行成功(或缓存命中) |
| progress | `{phase, round?, note, ts}` | 每次阶段/轮次迁移 |
| search_hit | `{round, query, engine, found, kept:[{idx,title,url,snippet}]}` | 每轮搜索完成 |
| content | `{delta:"…"}` | 报告 markdown 增量 |
| sources | `{items:[{idx,title,url,site,date}]}` | 引用列表定稿(done 前) |
| done | `{taskId, status:'completed'\|'scarce', elapsedMs, sourcesKept, scarcity, yuan}` | 终态 |
| error | `{code, message, retryable}` | 失败终态 |
| continue_polling | `{taskId, intervalMs:3000}` | 服务端主动断流前;客户端连续 2 次 EventSource error 也自行切换 |

示例:
```
event: search_hit
data: {"round":1,"query":"云龙县 历史沿革 建制","engine":"bocha","found":10,
       "kept":[{"idx":1,"title":"云龙县志·建制沿革","url":"https://…","snippet":"…"}]}
```

## 7. 适配器接口与降级链

```ts
interface SearchHit { title: string; url: string; urlNorm: string;
  snippet: string; publishedAt?: string; engine: SearchEngine; }

interface SearchProvider {
  readonly name: 'bocha' | 'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou';
  search(query: string, opts: { count?: number; freshness?: string;
    signal?: AbortSignal }): Promise<SearchHit[]>;
}

interface LlmRequest { model?: string; messages: ChatMsg[];   // model 省略时各 provider 用自己的默认模型
  temperature?: number; maxTokens?: number; signal?: AbortSignal }
interface LlmProvider {
  readonly name: 'deepseek' | 'qwen' | 'llm-chain';
  chatStream(req: LlmRequest): LlmCall;   // LlmCall = { stream, usage: Promise<LlmUsage> }
}

interface FetchedPage { url: string; title: string; text: string;
  chars: number; ok: boolean; reason?: string; }
interface Fetcher { fetch(url: string, signal?: AbortSignal): Promise<FetchedPage>; }
// readability 去噪,正文截断 ~8K 字;预留 og:image 字段(P1 配图管线)
```

- **降级链**:Search `[deepseek → bocha]`(`SEARCH_MODE=ab` 时三家全链 deepseek→bocha→zhipu_std)。DeepSeek Search API(2026,`POST /v1/tools/search`,$0.75/千次 ≈ ¥0.005/次,仅成功计费,自带 rerank_score/authority,`lang:zh` 支持)为默认主力;博查兜底(有 key 时自动生效)。LLM `[deepseek]` 单链——智谱 GLM 备用适配器已实现(qwen.ts,走智谱 OpenAI 兼容端点 + `LLM_BACKUP_MODEL`)但默认不接线。策略:超时/5xx → 同家重试 1 次 → 下一家;同家连续 3 次失败 → 进程内熔断 5 分钟
- **每调用超时组合**:搜索/抓取的 15s 上限与任务级 signal 用 `AbortSignal.any` 组合(管线传 signal 时 15s 仍生效);LLM 调用按阶段预算组合(planning 60s / synthesize 180s / scarce 90s)
- **轮次引擎策略**(可配置):默认链下每轮 deepseek 广搜(count=10);`SEARCH_MODE=bocha|zhipu` 为 A/B 对照模式,`ab` 三家全链。R3+ 深挖轮切 zhipu_sogou 打知乎源留 M1
- Fetcher 规则:遵守 robots.txt(REP 连续 UA 行合并分组)、单域串行(M1 强化)、只存摘要与被引单句

## 8. 流水线细节

```
run(task):
  1 plan     = llm.plan(place, direction, extra)        # 5-8 个可搜索子问题(prompt 见 D2)
  2 for round in 1..6(自适应;round≥2 且 kept 覆盖全部子问题则提前退出):
      queries = 按轮次引擎策略生成
      hits    = Promise.allSettled(并行 search)
      kept   += dedupe(url_norm) → 域名权重 → 相关性打分(top 截断)
  3 if len(kept) < 3 → scarce 路径:降级模板(区划沿革+自然地理)
  4 pages    = fetcher.fetchAll(kept[:12])              # 并发 4
  5 pack     = kept.map(s => `[${s.idx}] ${s.title}·${domain}·${date}\n${snippet}`)
  6 report   = llm.synthesizeStream(place, plan, pack, pages)   # 只准引用 [n]
  7 report   = citations.validate(report, kept)         # 正则扫 [n],越界/不存在 → 剔除并计数
  8 finalize:来源列表由代码从 sources 表渲染(非 LLM 生成)→ share_token → cost 汇总
```

- **引用规则(F4)**:编号由代码在步骤 5 分配注入;步骤 7 剔除幻觉引用并计数,无效标记 >20% 记 quality flag(供 D3 盲评参考)
- **scarce(F5)**:成功终态的变体,报告顶部渲染"资料稀缺"横幅,不编造

## 9. 逆地理编码(F2)

1. **主路**:天地图逆地理 API(服务端 key)→ 省/市/县 + 最近 POI(候选村名)
2. **兜底**(主路失败或粒度不到县):内置民政部行政区划县界 GeoJSON,point-in-polygon 查询 → 省/市/县(数据随仓库,MB 级)
3. **村名**:逆编码不可靠 → `village:null`,展示名拼到县;村级地名由研究阶段从县志/搜索结果反推(place_json.source='research',回写展示名)
4. 浏览器只持有瓦片 key(域名白名单);逆编码走服务端 key

## 10. 缓存回放

- `cache_key = sha256(县级行政区归一化名 + round(lat,2) + round(lng,2) + direction)`
  - 坐标 2 位小数(≈1.1km):同村/同镇点击命中;县内相距远两点视为不同研究
  - **direction 入键**:同地点不同方向产出不同报告——"地名+坐标"口径的必要细化
- 命中 → 回放原任务报告(§5);终态(completed/scarce)时写入,expires_at=now+30d;过期惰性删除

## 11. 配置与密钥

| 环境变量 | 用途 |
|---|---|
| BOCHA_API_KEY / ZHIPU_API_KEY / DEEPSEEK_API_KEY | 三把 key(PREP 1.1/1.1b/1.2) |
| TIANDITU_KEY_SERVER / TIANDITU_KEY_BROWSER | 逆编码 / 瓦片,分 key 管理 |
| SEARCH_MODE = deepseek(默认)\|bocha\|zhipu\|ab | 搜索主力选择,M0 A/B 用不同模式各跑一遍 |
| SCARCITY_THRESHOLD=3 / REPORT_MAX_SOURCES=12 / FETCH_CONCURRENCY=4 | 流水线阈值 |
| DEEPSEEK_MODEL=deepseek-chat / LLM_BACKUP_MODEL=glm-4-flash | 主/备 LLM 模型名 |

密钥仅服务端;浏览器可见的只有 TIANDITU_KEY_BROWSER。

## 12. 可观测性

- 每任务 `cost_json`(按引擎搜索次数、LLM tokens、折合 ¥)与 `timings_json`(各阶段耗时)
- 结构化 JSON 日志一行一事件(taskId/phase/engine/elapsedMs/code)到 stdout
- 👍/👎 落 feedback 列;M0 验收用 SQL 汇总配合 D3 盲评

## 13. 非目标(M0/M1 明确不做)

鉴权与限流(P1)、配图管线(P1,FetchedPage 预留 og:image)、排除来源重研究(P1,sources.stage 已预留)、多实例/消息队列、监控告警体系、PDF 导出(P1)

## 14. M0 验收对照

- D3 的 10 地点梯度全跑通:completed / scarce / failed 三态均有正确出口
- 每任务可从 DB 完整重建(GET /:id);断线 → /poll 接力;刷新 → 报告页恢复
- cost_json 汇总单次 ≤¥0.25(实测口径,供 D3 复核)
