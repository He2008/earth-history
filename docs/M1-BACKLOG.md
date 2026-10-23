# M1 待办(来自 M0 实施终审的 deferred 项)

> 来源:M0 实施计划(docs/superpowers/plans/2026-10-22-m0-orchestrator.md)各任务审查 + 终审分诊。
> 原则:不阻塞 M0 跑分(D3),M1 动工时逐项认领或明确丢弃。

## 高优先(与成本/可信度直接相关)

- **稀疏地点搜索成本**(2026-10-23 已大幅缓解):主力切 DeepSeek 搜索(¥0.005/次)后,退化 18 次也仅 ≈¥0.10,¥0.25 目标内。覆盖计数退化本身仍在(白跑轮次浪费延迟),M1 优化:重复命中计入当前子问题 + 缺口补查换 query;D3 跑分仍盯 `summary.csv` 的 yuan 列。
  - 2026-10-23 已做(m1-backlog):覆盖计数改为每子问题 URL 集合(重复命中计入当前子问题,同 URL 同子问题不重复计),全覆盖后不再白跑复核轮,缺口补查逐轮换 query 措辞(`QUERY_VARIANTS`:历史资料/百科/概况/地方志)。集成测试:高度重叠结果 7 次搜索 → 2 次闭环。
- **repo patch 键白名单**:updateTask/updateSource 的列名插值,加 5 行 `ALLOWED_PATCH_KEYS` 白名单(当前全内部字面量调用,无注入面)。
  - 2026-10-23 已做(m1-backlog):`ALLOWED_TASK_PATCH_KEYS` / `ALLOWED_SOURCE_PATCH_KEYS` + `assertPatchKeys`,非法键即抛 `illegal patch key`。
- **`quote`(被引单句)列从未填充**:schema 有列、TDD 承诺"存被引单句",M1 在引用校验后回写被引句(来源核查用)。
  - 2026-10-23 已做(m1-backlog):`extractCitedSentence` 从校验后正文提取首个被引句(句子边界切分、≤200 字合规口径)随 cited 状态回写;`hasCitation` 编号精确匹配替换 `includes` 子串判定。

## 中优先

- LLM usage/chain 结算边角:仅创建 LlmCall 不消费 stream 时 usage 永挂(理论);qwen.ts 文件名沿用但实为智谱 GLM,改名 glm.ts。
- SSE 契约对齐:`continue_polling` 事件未发(M0 无服务端主动断流,部署到反代后再启用);事件缺自增 `id:`;`search_hit.kept[]` 缺 idx。
- fetcher:`AbortSignal.any` 已修信号旁路,但 abort 与网络错误同归 reason:'error';robots 不支持 Allow 行/查询串规则;单域串行未实现(TDD §7 承诺)。
- 首个 progress 事件在订阅前发出即丢失(订阅先于任务启动可修);scarce 相位抖动(scarce→synthesizing→scarce)。
- ~~`>20% 无效引用` quality flag 只进 timeline,D3 盲评看不到~~;poll 响应缺 `scarcity` 字段;~~结构化 stdout 日志(TDD §12)未做~~。
  - 2026-10-23 已做(D4,docs/LOGGING.md):结构化 stdout 日志全量落地(bus 白名单转发 + 12 埋点,含 `task.done.reportChars` 空报告探针、`fetch.start`(debug)卡死探针);quality flag 现同时进 timeline(`quality_flag: …`)与日志(`citations.invalid`);fetch 失败逐条 `fetch.fail` + `fetch.summary` + timeline 汇总;失败任务 catch 路径补 timeline `failed` 条目;生产验收 2095B/任务。
- `startResearch` 无并发去重(同 key 并发会建两个任务);缓存过期行只判定不删除。

## 低优先(打磨)

- 状态机 GRAPH 键值加 State 字面量类型;canTransition 生产未调用(纯校验件);register 重复 id 覆盖;shutdown 无幂等防重入。
- citations:`[1234]` 4 位编号不剔除;markdown 链接剔除后残留孤立 `(url)`;published_at 空串显示空白。
- normalizeUrl:try/catch 兜底畸形 URL;`httpx://` 误匹配;追踪参数删除大小写敏感。
- readability:实体双重解码/十六进制实体/代理对截断;htmlToText 截断无测试。
- `.superpowers/` 加进仓库 .gitignore(目前靠全局 excludesfile);测试 NODE_ENV 守卫已做,HMR 监听器堆叠为 dev 噪音。
- run-m0:`dukeong` slug 非标准拼写(独克宗);catch 路径不写 .md。
- parsePlan 兜底过滤丢弃 2-4 字符问题;prompts.ts 加"拆私有仓库"出处头注释(M0 结束拆分时一并做)。

## 追加(2026-10-23 跑分实战)

- ~~OOM 崩溃链~~ 已修:fetcher 响应体 2MB 字节上限(曾致 node V8 堆耗尽崩溃,连杀整批任务);robots.txt 5s 超时+接入任务信号(曾致抓取阶段挂死 14 分钟,且硬上限 abort 打不断)。
- ~~dev 模式丢 content 事件~~ 诊断更正:实为思考型模型吃光 max_tokens 配额致正文为空(已修:thinking 禁用 + 上限 8192);跑分脚本以 DB 终稿回写的做法保留(更稳)。
- `next start` 与 `output: standalone` 有不兼容警告但实测可用;正式部署用 `node .next/standalone/server.js`。

## 追加(2026-10-23 F8 境外随机点,方案定稿未实施)

- **全球逆地理兜底**:F8 的 20% 全球随机点出了中国就没有中文名(研究靠地名驱动)。候选全数否决——天地图/高德/百度只覆盖中国;Google/Mapbox/HERE 付费+境外卡+服务器在国内不可达;Nominatim 免费实例限速 1qps+国内超时+返回英文名;自建 OSM 全量(几十 GB)对一个内测期每天几次的边缘路径太重。且荒野点上商业服务粒度也一样粗(「最近有人地几十公里外」),LLM 不吃亏。
  - **定稿方案:地理编码降级链** 天地图(中国,POI 级)→ LLM 粗定位(DeepSeek,~¥0.001/次,输入 lat/lng 输出 JSON `{ocean, country_zh, region_zh, region_en, confidence}`):海洋点趣味拒绝+自动重抽;境外陆地 place_name=「国家·一级行政区」做区域史,中文资料薄自然走 scarce 降级(机制现成);意外红利:海外华人地点(旧金山/槟城/马六甲)中文史料极丰富。
  - **落地清单**:`src/server/geocode/` 加 llm-fallback 适配器(复用 LlmProvider,TDD)→ `/api/geocode` 接链 → `pickRandomPlace` 加 20% 全球均匀随机(纬度 sin 分布保证面积均匀)→ 确认弹窗加「区域粗定位」标识 → 规划 prompt 注入境外区域提示(子问题可双语 query)。
  - **升级路线**:随机探索变高频后,换离线 Natural Earth 国家+一级行政区边界(~100MB,point-in-polygon 毫秒级)+中文名映射表,零 API 成本替换 LLM 兜底,粒度相同。
