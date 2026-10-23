# 史地

3D 卫星地球 × AI 中文史料深度研究。当前:M0 编排器。文档见 `docs/`。

## 快速开始

```bash
npm install          # .npmrc 已指向 npmmirror
cp .env.example .env # 填 DeepSeek key 即可开工(博查/智谱为可选兜底/A-B)
npm test             # 全部测试,不需要真实 key
```

## 跑 D3 验证(十地点报告)

```bash
npm run build && npm run start   # 生产模式起服务
npm run m0                       # 另开终端:默认每次最多跑 3 个新地点(约 ¥0.25),缓存回放免费
npm run m0 -- 10                 # 想一次跑全量时显式给个数
```

**花钱规则**:一个没跑过的地点约 ¥0.08;30 天内跑过的免费回放,不占每次的名额。
跑过的报告都留在 `reports/` 和数据库里,重跑脚本不会重复花钱。

**注意:跑分请用生产模式。** `next dev` 的流式转发层可能随机丢弃高频 SSE `content` 事件
(表现为报告文件为空/截断,但任务状态正常、数据库终稿完整);跑分脚本已改为以 DB 终稿
回写报告(`GET /api/research/:id`),流式增量仅作兜底,但进度展示仍建议用生产模式。
dev 模式适合日常开发调试,内存占用也更高。

## 常用

- `npm run dev` 开发服务 / `npm run start` 生产服务(`output: standalone` 下有警告但可用)
- `SEARCH_MODE=deepseek|bocha|zhipu|ab` 切换搜索主力(D3 三方 A/B 用)
- 报告与来源全部落 SQLite(`data/shidi.db`),断线/刷新可从 `GET /api/research/:id` 恢复
