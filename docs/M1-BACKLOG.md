# M1 待办(来自 M0 实施终审的 deferred 项)

> 来源:M0 实施计划(docs/superpowers/plans/2026-10-22-m0-orchestrator.md)各任务审查 + 终审分诊。
> 原则:不阻塞 M0 跑分(D3),M1 动工时逐项认领或明确丢弃。

## 高优先(与成本/可信度直接相关)

- **稀疏地点搜索成本**(2026-10-23 已大幅缓解):主力切 DeepSeek 搜索(¥0.005/次)后,退化 18 次也仅 ≈¥0.10,¥0.25 目标内。覆盖计数退化本身仍在(白跑轮次浪费延迟),M1 优化:重复命中计入当前子问题 + 缺口补查换 query;D3 跑分仍盯 `summary.csv` 的 yuan 列。
- **repo patch 键白名单**:updateTask/updateSource 的列名插值,加 5 行 `ALLOWED_PATCH_KEYS` 白名单(当前全内部字面量调用,无注入面)。
- **`quote`(被引单句)列从未填充**:schema 有列、TDD 承诺"存被引单句",M1 在引用校验后回写被引句(来源核查用)。

## 中优先

- LLM usage/chain 结算边角:仅创建 LlmCall 不消费 stream 时 usage 永挂(理论);qwen.ts 文件名沿用但实为智谱 GLM,改名 glm.ts。
- SSE 契约对齐:`continue_polling` 事件未发(M0 无服务端主动断流,部署到反代后再启用);事件缺自增 `id:`;`search_hit.kept[]` 缺 idx。
- fetcher:`AbortSignal.any` 已修信号旁路,但 abort 与网络错误同归 reason:'error';robots 不支持 Allow 行/查询串规则;单域串行未实现(TDD §7 承诺)。
- 首个 progress 事件在订阅前发出即丢失(订阅先于任务启动可修);scarce 相位抖动(scarce→synthesizing→scarce)。
- `>20% 无效引用` quality flag 只进 timeline,D3 盲评看不到;poll 响应缺 `scarcity` 字段;结构化 stdout 日志(TDD §12)未做。
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
- dev 模式 SSE 中继会随机丢高频 content 事件(生产模式正常):跑分脚本已改为 done 后从 `GET /api/research/:id` 取 DB 终稿回写;M1 若要在 dev 下调试流式 UI 再查 Next dev 流转发层。
- `next start` 与 `output: standalone` 有不兼容警告但实测可用;正式部署用 `node .next/standalone/server.js`。
