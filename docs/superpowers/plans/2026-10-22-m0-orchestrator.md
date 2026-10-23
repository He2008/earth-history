# 「史地」M0 编排器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/TDD.md` 实现自建研究编排器(状态机 + 搜索/LLM/抓取适配器 + SQLite + SSE API),跑通 D3 的 10 地点验证。

**Architecture:** 单进程 Next.js 15 应用,编排器在进程内运行、状态全部落 SQLite;所有外部依赖(博查/智谱/DeepSeek/Qwen/抓取)通过适配器注入,测试全部用假实现、不碰真实网络。API 层 POST 创建任务并以 SSE 流式返回,断线走短轮询。

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript strict + better-sqlite3 + zod + nanoid + vitest + tsx。

## Global Constraints

- Node ≥ 20(本机 24.19 满足);npm 源 npmmirror(`.npmrc` 固定)
- 依赖白名单:`next` `react` `react-dom` `better-sqlite3` `nanoid` `zod`;dev:`typescript` `vitest` `tsx` `@types/*`。新增依赖必须先改 PRD/TDD
- 禁用 `next/font/google`(TDD §1);字体 M1 再以本地文件引入
- 模块别名 `@/*` → `src/*`;TS `strict: true`
- 状态名逐字:`queued|planning|searching|fetching|synthesizing|completed|scarce|failed`(TDD §3)
- SSE 事件名逐字:`task_created|progress|search_hit|content|sources|done|error|continue_polling`(TDD §6)
- 错误码逐字:`invalid_params|geocode_failed|search_all_failed|llm_all_failed|timeout|stale_task|not_found|internal`(TDD §5)
- 引用编号只由代码分配;`validateCitations` 必须剔除越界 `[n]`(PRD F4)
- 抓取只落库 ≤200 字 snippet;正文仅在内存使用、截断 8000 字,不全文转载(PREP §4)
- 单任务硬上限 10 分钟;一切状态可从 DB 重建(TDD §3)
- `next.config.ts` 必须含 `serverExternalPackages: ['better-sqlite3']`(原生模块不被打包)
- prompts 位于 `src/private/prompts.ts`、地点池位于 `scripts/locations.json`——M0 结束拆私有仓库,公开仓库不含(PRD §9 开源边界)
- 测试禁止真实网络调用与真实 API key;所有 fetch 以注入/mocked 方式替换
- 提交信息用 conventional commits;每个任务至少一次提交
- 坐标全链路 WGS84,不引入 GCJ-02(PRD §5.2)

---

### Task 1: 工程脚手架(git + Next.js + vitest)

**Files:**
- Create: `package.json`, `.npmrc`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `README.md`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`(占位页,M1 换地球)
- Test: `tests/sanity.test.ts`

**Interfaces:**
- Consumes: 无(首个任务)
- Produces: 可 `npm run dev` / `npm test` 的空工程;别名 `@/*` → `src/*`

- [ ] **Step 1: git 初始化与目录**

```bash
cd /Users/apple/Code/史地
git init
mkdir -p src/app tests scripts src/private
```

- [ ] **Step 2: 写工程文件**

`package.json`:
```json
{
  "name": "shidi",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "m0": "tsx scripts/run-m0.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "nanoid": "^5.0.7",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`.npmrc`:
```
registry=https://registry.npmmirror.com
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`vitest.config.ts`:
```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

`.env.example`:
```
BOCHA_API_KEY=
ZHIPU_API_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
QWEN_MODEL=qwen-plus
SEARCH_MODE=bocha
SCARCITY_THRESHOLD=3
REPORT_MAX_SOURCES=12
FETCH_CONCURRENCY=4
TIANDITU_KEY_SERVER=
TIANDITU_KEY_BROWSER=
DB_PATH=data/shidi.db
```

`.gitignore`:
```
node_modules/
.next/
data/
reports/
.env
.env.local
*.tsbuildinfo
.DS_Store
```

`src/app/layout.tsx`:
```tsx
export const metadata = { title: '史地' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>史地 M0</h1>
      <p>编排器服务已启动。用 `npm run m0` 或 `curl -N -X POST localhost:3000/api/research` 触发研究。</p>
      <p>AI 生成内容,仅供参考。</p>
    </main>
  );
}
```

`README.md`:
```markdown
# 史地

3D 卫星地球 × AI 中文史料深度研究。当前:M0 编排器。文档见 `docs/`。

## 快速开始

​```bash
npm install          # .npmrc 已指向 npmmirror
cp .env.example .env # 填三把 key(博查/智谱/DeepSeek),PREP §1
npm test             # 全部测试,不需要真实 key
npm run dev          # 起服务
npm run m0           # 跑 D3 十地点验证(需要 key,先起 dev)
​```
```

- [ ] **Step 3: 安装依赖**

Run: `npm install`
Expected: 成功,lockfile 生成,无 peer 冲突(better-sqlite3 有 prebuilt 二进制)

- [ ] **Step 4: 写 sanity 测试**

`tests/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('vitest 与别名可用', async () => {
    const { DIRECTIONS } = await import('@/lib/types');
    expect(DIRECTIONS.length).toBe(8);
  });
});
```

同时建 `src/lib/types.ts`(后续任务会扩展,这里放最小内容让测试通过):
```ts
export const DIRECTIONS = [
  '综合沿革', '战争军事', '自然地理', '民族风俗',
  '历史人物', '古建筑文物', '经济商贸', '近现代变迁',
] as const;
export type Direction = (typeof DIRECTIONS)[number];
```

- [ ] **Step 5: 跑测试验证**

Run: `npm test`
Expected: PASS(1 个测试)

- [ ] **Step 6: 验证 dev 可起(不依赖 key)**

Run: `npm run dev` 后另开终端 `curl -s localhost:3000 | head -5`,然后停掉 dev
Expected: 返回包含"史地 M0"的 HTML

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: Next.js 15 脚手架 + vitest(npmmirror、standalone、better-sqlite3 外置)"
```

---

### Task 2: config 与 cache-key(lib 基础)

**Files:**
- Create: `src/lib/config.ts`, `src/lib/cache-key.ts`
- Modify: `src/lib/types.ts`(补 PlaceInput / placeDisplayName / ResearchInput)
- Test: `tests/config.test.ts`, `tests/cache-key.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `loadConfig(env?) → Config`(字段见 .env.example);`cacheKey(county, lat, lng, direction) → string`(sha256 hex);`PlaceInput { province; city?; county; village? }`;`placeDisplayName(p) → string`;`ResearchInput { lat; lng; place: PlaceInput; direction: Direction; extra? }`

- [ ] **Step 1: 写失败测试**

`tests/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '@/lib/config';

describe('loadConfig', () => {
  it('空环境给默认值', () => {
    const c = loadConfig({});
    expect(c.SEARCH_MODE).toBe('bocha');
    expect(c.SCARCITY_THRESHOLD).toBe(3);
    expect(c.REPORT_MAX_SOURCES).toBe(12);
    expect(c.FETCH_CONCURRENCY).toBe(4);
    expect(c.DB_PATH).toBe('data/shidi.db');
    expect(c.DEEPSEEK_MODEL).toBe('deepseek-chat');
  });
  it('SEARCH_MODE 非法值抛错', () => {
    expect(() => loadConfig({ SEARCH_MODE: 'baidu' })).toThrow();
  });
  it('数字字符串被 coerce', () => {
    expect(loadConfig({ SCARCITY_THRESHOLD: '5' }).SCARCITY_THRESHOLD).toBe(5);
  });
});
```

`tests/cache-key.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cacheKey } from '@/lib/cache-key';

describe('cacheKey', () => {
  const base = cacheKey('云龙县', 25.881, 99.152, '综合沿革');
  it('同县同点同方向 → 相同 key', () => {
    expect(cacheKey('云龙县', 25.881, 99.152, '综合沿革')).toBe(base);
  });
  it('坐标第 3 位小数内抖动(≈1km)不影响', () => {
    expect(cacheKey('云龙县', 25.884, 99.149, '综合沿革')).toBe(base);
  });
  it('方向不同 → key 不同', () => {
    expect(cacheKey('云龙县', 25.881, 99.152, '战争军事')).not.toBe(base);
  });
  it('县名空白被归一化', () => {
    expect(cacheKey(' 云龙县 ', 25.881, 99.152, '综合沿革')).toBe(base);
  });
  it('不同县 → key 不同', () => {
    expect(cacheKey('临县', 25.881, 99.152, '综合沿革')).not.toBe(base);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/config.test.ts tests/cache-key.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/lib/config.ts`:
```ts
import { z } from 'zod';

const EnvSchema = z.object({
  BOCHA_API_KEY: z.string().default(''),
  ZHIPU_API_KEY: z.string().default(''),
  DEEPSEEK_API_KEY: z.string().default(''),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  QWEN_MODEL: z.string().default('qwen-plus'),
  SEARCH_MODE: z.enum(['bocha', 'zhipu', 'ab']).default('bocha'),
  SCARCITY_THRESHOLD: z.coerce.number().default(3),
  REPORT_MAX_SOURCES: z.coerce.number().default(12),
  FETCH_CONCURRENCY: z.coerce.number().default(4),
  TIANDITU_KEY_SERVER: z.string().default(''),
  TIANDITU_KEY_BROWSER: z.string().default(''),
  DB_PATH: z.string().default('data/shidi.db'),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  return EnvSchema.parse(env);
}

export const config = loadConfig();
```

`src/lib/cache-key.ts`:
```ts
import { createHash } from 'node:crypto';

export function cacheKey(county: string, lat: number, lng: number, direction: string): string {
  const name = county.trim().replace(/\s+/g, '');
  const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return createHash('sha256').update(`${name}|${r2(lat)}|${r2(lng)}|${direction}`).digest('hex');
}
```

`src/lib/types.ts` 追加:
```ts
export interface PlaceInput {
  province: string;
  city?: string | null;
  county: string;
  village?: string | null;
}

export function placeDisplayName(p: PlaceInput): string {
  return [p.province, p.city, p.county, p.village].filter(Boolean).join('');
}

export interface ResearchInput {
  lat: number;
  lng: number;
  place: PlaceInput;
  direction: Direction;
  extra?: string;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/config.test.ts tests/cache-key.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/lib tests
git commit -m "feat: env 配置加载与缓存键(县名+坐标2位+方向)"
```

---

### Task 3: DB 层(schema / 迁移 / repo)

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/db/repo.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `Config.DB_PATH`(经 `config`)
- Produces: `SCHEMA_SQL`;`openDb(path)`;`migrate(db)`;`createRepo(db) → Repo`,方法:`createTask(t)`, `getTask(id)`, `updateTask(id, patch)`, `appendTimeline(id, entry)`, `saveReportDelta(id, delta)`, `insertSource(s) → rowId`, `updateSource(rowId, patch)`, `dropCandidates(taskId)`, `listSources(taskId, stage?)`, `cachePut(key, taskId, ttlMs?)`, `cacheGet(key)`, `sweepStaleTasks(maxAgeMs?)`;单例 `getDb()`, `getRepo()`(首次调用自动建目录+迁移,测试用 `createRepo(openDb(':memory:'))`)

- [ ] **Step 1: 写失败测试**

`tests/db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '@/server/db/client';
import { createRepo } from '@/server/db/repo';
import type Database from 'better-sqlite3';

let repo: ReturnType<typeof createRepo>;
let db: Database.Database;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = createRepo(db);
});

const task = { id: 't1', place_name: '云南省大理州云龙县', place_json: '{"province":"云南省","county":"云龙县"}', lat: 25.88, lng: 99.15, direction: '综合沿革' };

describe('repo tasks', () => {
  it('创建后可读取,初始 queued', () => {
    repo.createTask(task);
    const t = repo.getTask('t1')!;
    expect(t.status).toBe('queued');
    expect(t.report_md).toBe('');
    expect(JSON.parse(t.timeline_json)).toEqual([]);
  });
  it('updateTask 更新字段与 updated_at', () => {
    repo.createTask(task);
    repo.updateTask('t1', { status: 'planning', plan_json: '["q1"]' });
    expect(repo.getTask('t1')!.status).toBe('planning');
    expect(repo.getTask('t1')!.plan_json).toBe('["q1"]');
  });
  it('appendTimeline 追加且保序', () => {
    repo.createTask(task);
    repo.appendTimeline('t1', { phase: 'planning', note: 'a', ts: 1 });
    repo.appendTimeline('t1', { phase: 'searching', note: 'b', ts: 2 });
    const tl = JSON.parse(repo.getTask('t1')!.timeline_json);
    expect(tl.map((e: any) => e.phase)).toEqual(['planning', 'searching']);
  });
  it('saveReportDelta 拼接追加', () => {
    repo.createTask(task);
    repo.saveReportDelta('t1', '第一段');
    repo.saveReportDelta('t1', '第二段');
    expect(repo.getTask('t1')!.report_md).toBe('第一段第二段');
  });
  it('sweepStaleTasks 清理非终态旧行为 failed/stale_task', () => {
    repo.createTask(task);
    repo.updateTask('t1', { updated_at: Date.now() - 10 * 60_000 });
    repo.sweepStaleTasks();
    const t = repo.getTask('t1')!;
    expect(t.status).toBe('failed');
    expect(t.error_code).toBe('stale_task');
  });
});

describe('repo sources', () => {
  it('插入、按 stage 过滤、dropCandidates 清候选', () => {
    repo.createTask(task);
    const id1 = repo.insertSource({ task_id: 't1', idx: null, stage: 'candidate', title: 'a', url: 'https://a/1', url_norm: 'https://a/1', snippet: 's', published_at: null, engine: 'bocha', score: null, fetched_chars: null, quote: null });
    repo.insertSource({ task_id: 't1', idx: 1, stage: 'kept', title: 'b', url: 'https://b/1', url_norm: 'https://b/1', snippet: 's', published_at: null, engine: 'bocha', score: 2, fetched_chars: null, quote: null });
    expect(repo.listSources('t1', 'kept').length).toBe(1);
    repo.updateSource(id1, { stage: 'kept', idx: 2 });
    expect(repo.listSources('t1', 'kept').length).toBe(2);
    repo.dropCandidates('t1');
    expect(repo.listSources('t1', 'candidate').length).toBe(0);
    expect(repo.listSources('t1', 'kept').length).toBe(2);
  });
});

describe('repo cache', () => {
  it('put/get 命中,过期返回 undefined', () => {
    repo.createTask(task);
    repo.cachePut('k1', 't1', 10_000);
    expect(repo.cacheGet('k1')?.task_id).toBe('t1');
    repo.cachePut('k2', 't1', -1);
    expect(repo.cacheGet('k2')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/db/schema.ts`(与 TDD §4 一致,加 IF NOT EXISTS 幂等):
```ts
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS research_tasks (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL,
  place_name    TEXT NOT NULL,
  place_json    TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  direction     TEXT NOT NULL,
  extra_instruction TEXT,
  plan_json     TEXT,
  timeline_json TEXT NOT NULL DEFAULT '[]',
  report_md     TEXT DEFAULT '',
  share_token   TEXT UNIQUE,
  error_code TEXT, error_msg TEXT,
  cost_json     TEXT,
  timings_json  TEXT,
  feedback      INTEGER,
  created_at INTEGER, updated_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON research_tasks(status, updated_at);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES research_tasks(id),
  idx   INTEGER,
  stage TEXT NOT NULL,
  title TEXT, url TEXT, url_norm TEXT,
  snippet TEXT, published_at TEXT,
  engine TEXT,
  score REAL, fetched_chars INTEGER, quote TEXT
);
CREATE INDEX IF NOT EXISTS idx_sources_task ON sources(task_id, stage);

CREATE TABLE IF NOT EXISTS research_cache (
  cache_key TEXT PRIMARY KEY,
  task_id   TEXT NOT NULL,
  created_at INTEGER, expires_at INTEGER
);
`;
```

`src/server/db/client.ts`:
```ts
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';
import { config } from '@/lib/config';

export function openDb(file: string): Database.Database {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}

let _db: Database.Database | undefined;
export function getDb(): Database.Database {
  if (!_db) {
    _db = openDb(config.DB_PATH);
    migrate(_db);
  }
  return _db;
}
```

`src/server/db/repo.ts`:
```ts
import type Database from 'better-sqlite3';
import { getDb } from './client';

export interface TaskRow {
  id: string; status: string; place_name: string; place_json: string;
  lat: number; lng: number; direction: string; extra_instruction: string | null;
  plan_json: string | null; timeline_json: string; report_md: string;
  share_token: string | null; error_code: string | null; error_msg: string | null;
  cost_json: string | null; timings_json: string | null; feedback: number | null;
  created_at: number; updated_at: number; finished_at: number | null;
}
export interface SourceRow {
  id: number; task_id: string; idx: number | null; stage: string;
  title: string; url: string; url_norm: string; snippet: string;
  published_at: string | null; engine: string; score: number | null;
  fetched_chars: number | null; quote: string | null;
}
export interface TimelineEntry { phase: string; round?: number; note: string; ts: number }
export type NewSource = Omit<SourceRow, 'id'>;

export function createRepo(db: Database.Database) {
  const now = () => Date.now();

  const createTask = (t: { id: string; place_name: string; place_json: string; lat: number; lng: number; direction: string; extra_instruction?: string }) =>
    db.prepare(`INSERT INTO research_tasks (id,status,place_name,place_json,lat,lng,direction,extra_instruction,timeline_json,report_md,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(t.id, 'queued', t.place_name, t.place_json, t.lat, t.lng, t.direction, t.extra_instruction ?? null, '[]', '', now(), now());

  const getTask = (id: string): TaskRow | undefined =>
    db.prepare('SELECT * FROM research_tasks WHERE id=?').get(id) as TaskRow | undefined;

  const updateTask = (id: string, patch: Record<string, unknown>) => {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k}=?`).join(',');
    db.prepare(`UPDATE research_tasks SET ${sets}, updated_at=? WHERE id=?`)
      .run(...keys.map((k) => patch[k]), now(), id);
  };

  const appendTimeline = (id: string, entry: TimelineEntry) => {
    const t = getTask(id);
    if (!t) return;
    const tl = JSON.parse(t.timeline_json || '[]') as TimelineEntry[];
    tl.push(entry);
    updateTask(id, { timeline_json: JSON.stringify(tl) });
  };

  const saveReportDelta = (id: string, delta: string) =>
    db.prepare('UPDATE research_tasks SET report_md = report_md || ?, updated_at=? WHERE id=?').run(delta, now(), id);

  const insertSource = (s: NewSource): number =>
    Number(db.prepare(`INSERT INTO sources (task_id,idx,stage,title,url,url_norm,snippet,published_at,engine,score,fetched_chars,quote)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(s.task_id, s.idx, s.stage, s.title, s.url, s.url_norm, s.snippet, s.published_at, s.engine, s.score, s.fetched_chars, s.quote).lastInsertRowid);

  const updateSource = (rowId: number, patch: Record<string, unknown>) => {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k}=?`).join(',');
    db.prepare(`UPDATE sources SET ${sets} WHERE id=?`).run(...keys.map((k) => patch[k]), rowId);
  };

  const dropCandidates = (taskId: string) =>
    db.prepare(`UPDATE sources SET stage='dropped' WHERE task_id=? AND stage='candidate'`).run(taskId);

  const listSources = (taskId: string, stage?: string): SourceRow[] =>
    (stage
      ? db.prepare('SELECT * FROM sources WHERE task_id=? AND stage=? ORDER BY idx').all(taskId, stage)
      : db.prepare('SELECT * FROM sources WHERE task_id=? ORDER BY idx').all(taskId)) as SourceRow[];

  const cachePut = (cache_key: string, task_id: string, ttlMs = 30 * 24 * 3600 * 1000) =>
    db.prepare('INSERT OR REPLACE INTO research_cache (cache_key,task_id,created_at,expires_at) VALUES (?,?,?,?)')
      .run(cache_key, task_id, now(), now() + ttlMs);

  const cacheGet = (cache_key: string): { task_id: string; expires_at: number } | undefined => {
    const r = db.prepare('SELECT * FROM research_cache WHERE cache_key=?').get(cache_key) as { task_id: string; expires_at: number } | undefined;
    if (!r) return undefined;
    return r.expires_at < now() ? undefined : r;
  };

  const sweepStaleTasks = (maxAgeMs = 5 * 60_000) =>
    db.prepare(`UPDATE research_tasks SET status='failed', error_code='stale_task', error_msg='服务重启,任务中断', finished_at=?, updated_at=?
                WHERE status NOT IN ('completed','scarce','failed') AND updated_at < ?`)
      .run(now(), now(), now() - maxAgeMs);

  return { createTask, getTask, updateTask, appendTimeline, saveReportDelta, insertSource, updateSource, dropCandidates, listSources, cachePut, cacheGet, sweepStaleTasks };
}

export type Repo = ReturnType<typeof createRepo>;

let _repo: Repo | undefined;
export function getRepo(): Repo {
  if (!_repo) _repo = createRepo(getDb());
  return _repo;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/server/db tests/db.test.ts
git commit -m "feat: SQLite 三表 schema 与 repo层(tasks/sources/cache)"
```

---

### Task 4: LLM 适配器(OpenAI 兼容 + 降级链)

**Files:**
- Create: `src/lib/openai-sse.ts`, `src/server/providers/llm/types.ts`, `src/server/providers/llm/openai-compat.ts`, `src/server/providers/llm/deepseek.ts`, `src/server/providers/llm/qwen.ts`, `src/server/providers/llm/chain.ts`
- Test: `tests/llm.test.ts`

**Interfaces:**
- Consumes: `config.DEEPSEEK_API_KEY` / `ZHIPU_API_KEY` / model 名
- Produces: `ChatMsg { role: 'system'|'user'|'assistant'; content: string }`;`LlmRequest { model; messages; temperature?; maxTokens?; signal? }`;`LlmChunk { delta?: string }`;`LlmUsage { promptTokens; completionTokens }`;`LlmCall { stream: AsyncIterable<LlmChunk>; usage: Promise<LlmUsage> }`;`LlmProvider { name; chatStream(req) → LlmCall }`;`openAiCompatibleLlm(name, baseUrl, getKey)`;`createDeepSeek(getKey?)` / `createQwen(getKey?)`;`createLlmChain(providers) → LlmProvider`(name='llm-chain':每家最多试 2 次,产出过内容后不再同家重试,连败 3 次熔断 5 分钟,全败抛 `LlmAllFailedError`);`sseDataLines(body)`

- [ ] **Step 1: 写失败测试**

`tests/llm.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createLlmChain, LlmAllFailedError } from '@/server/providers/llm/chain';
import type { LlmProvider, LlmRequest } from '@/server/providers/llm/types';

function fake(name: string, chunks: string[], behavior: { failFirstN?: number; usage?: { promptTokens: number; completionTokens: number } } = {}): LlmProvider {
  let calls = 0;
  return {
    name: name as LlmProvider['name'],
    chatStream(req: LlmRequest) {
      const n = calls++;
      const usage = Promise.resolve(behavior.usage ?? { promptTokens: 10, completionTokens: 20 });
      return {
        usage,
        stream: (async function* () {
          if (n < (behavior.failFirstN ?? 0)) throw new Error(`${name} fail #${n}`);
          for (const c of chunks) yield { delta: c };
        })(),
      };
    },
  };
}

describe('llm chain', () => {
  it('首选正常 → 拼接 delta,usage 可取', async () => {
    const chain = createLlmChain([fake('deepseek', ['你好', '世界'])]);
    const call = chain.chatStream({ model: 'm', messages: [{ role: 'user', content: 'q' }] });
    let out = '';
    for await (const c of call.stream) out += c.delta ?? '';
    expect(out).toBe('你好世界');
    expect(await call.usage).toEqual({ promptTokens: 10, completionTokens: 20 });
  });
  it('首选连败 → 落到备选', async () => {
    const chain = createLlmChain([fake('deepseek', [], { failFirstN: 2 }), fake('qwen', ['备选'])]);
    const call = chain.chatStream({ model: 'm', messages: [] });
    let out = '';
    for await (const c of call.stream) out += c.delta ?? '';
    expect(out).toBe('备选');
  });
  it('首选第一次失败第二次成功(同家重试 1 次)', async () => {
    const chain = createLlmChain([fake('deepseek', ['ok'], { failFirstN: 1 })]);
    const call = chain.chatStream({ model: 'm', messages: [] });
    let out = '';
    for await (const c of call.stream) out += c.delta ?? '';
    expect(out).toBe('ok');
  });
  it('全部失败 → LlmAllFailedError', async () => {
    const chain = createLlmChain([fake('deepseek', [], { failFirstN: 99 }), fake('qwen', [], { failFirstN: 99 })]);
    const call = chain.chatStream({ model: 'm', messages: [] });
    await expect(async () => { for await (const _ of call.stream) { /* drain */ } }).rejects.toThrow(LlmAllFailedError);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/llm.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/lib/openai-sse.ts`:
```ts
export async function* sseDataLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}
```

`src/server/providers/llm/types.ts`:
```ts
export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface LlmRequest {
  model: string; messages: ChatMsg[];
  temperature?: number; maxTokens?: number; signal?: AbortSignal;
}
export interface LlmChunk { delta?: string }
export interface LlmUsage { promptTokens: number; completionTokens: number }
export interface LlmCall { stream: AsyncIterable<LlmChunk>; usage: Promise<LlmUsage> }
export interface LlmProvider {
  readonly name: 'deepseek' | 'qwen' | 'llm-chain';
  chatStream(req: LlmRequest): LlmCall;
}
export class LlmAllFailedError extends Error {
  constructor(public providers: string[]) { super(`所有 LLM 提供方失败: ${providers.join(',')}`); }
}
```

`src/server/providers/llm/openai-compat.ts`:
```ts
import { sseDataLines } from '@/lib/openai-sse';
import type { LlmCall, LlmProvider, LlmRequest, LlmUsage } from './types';

export function openAiCompatibleLlm(name: 'deepseek' | 'qwen', baseUrl: string, getKey: () => string): LlmProvider {
  return {
    name,
    chatStream(req: LlmRequest): LlmCall {
      let usageRes!: (u: LlmUsage) => void;
      let usageRej!: (e: unknown) => void;
      const usage = new Promise<LlmUsage>((res, rej) => { usageRes = res; usageRej = rej; });
      const stream = (async function* () {
        const key = getKey();
        if (!key) throw new Error(`${name}: 缺少 API key`);
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: req.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            stream: true,
            stream_options: { include_usage: true },
            ...(req.temperature != null && { temperature: req.temperature }),
            ...(req.maxTokens != null && { max_tokens: req.maxTokens }),
          }),
        });
        if (!resp.ok || !resp.body) throw new Error(`${name}: HTTP ${resp.status}`);
        let u: LlmUsage = { promptTokens: 0, completionTokens: 0 };
        try {
          for await (const data of sseDataLines(resp.body)) {
            if (data === '[DONE]') break;
            const j = JSON.parse(data);
            const d: unknown = j.choices?.[0]?.delta?.content;
            if (typeof d === 'string' && d) yield { delta: d };
            if (j.usage) u = { promptTokens: j.usage.prompt_tokens ?? 0, completionTokens: j.usage.completion_tokens ?? 0 };
          }
          usageRes(u);
        } catch (e) {
          usageRej(e);
          throw e;
        }
      })();
      return { stream, usage };
    },
  };
}
```

`src/server/providers/llm/deepseek.ts`:
```ts
import { config } from '@/lib/config';
import { openAiCompatibleLlm } from './openai-compat';

export const DEEPSEEK_BASE = 'https://api.deepseek.com';

export function createDeepSeek(getKey: () => string = () => config.DEEPSEEK_API_KEY) {
  return openAiCompatibleLlm('deepseek', DEEPSEEK_BASE, getKey);
}
```

`src/server/providers/llm/qwen.ts`:
```ts
import { config } from '@/lib/config';
import { openAiCompatibleLlm } from './openai-compat';

export const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export function createQwen(getKey: () => string = () => config.ZHIPU_API_KEY) {
  return openAiCompatibleLlm('qwen', QWEN_BASE, getKey);
}
```

`src/server/providers/llm/chain.ts`:
```ts
import { LlmAllFailedError, type LlmCall, type LlmProvider, type LlmRequest, type LlmUsage } from './types';

export function createLlmChain(providers: LlmProvider[]): LlmProvider {
  const fails = new Map<string, number>();
  const blockedUntil = new Map<string, number>();
  return {
    name: 'llm-chain',
    chatStream(req: LlmRequest): LlmCall {
      let usageRes!: (u: LlmUsage) => void;
      let usageRej!: (e: unknown) => void;
      const usage = new Promise<LlmUsage>((res, rej) => { usageRes = res; usageRej = rej; });
      const stream = (async function* () {
        const tried: string[] = [];
        for (const p of providers) {
          if ((blockedUntil.get(p.name) ?? 0) > Date.now()) continue;
          for (let attempt = 0; attempt < 2; attempt++) {
            const call = p.chatStream(req);
            let produced = false;
            let ok = false;
            try {
              for await (const c of call.stream) { produced = true; yield c; }
              ok = true;
            } catch (e) {
              if (produced) { tried.push(`${p.name}:partial`); throw e; }
              tried.push(`${p.name}#${attempt}`);
            }
            if (ok) {
              call.usage.then(usageRes, usageRej);
              fails.set(p.name, 0);
              return;
            }
            const n = (fails.get(p.name) ?? 0) + 1;
            fails.set(p.name, n);
            if (n >= 3) blockedUntil.set(p.name, Date.now() + 5 * 60_000);
          }
        }
        const err = new LlmAllFailedError(tried);
        usageRej(err);
        throw err;
      })();
      return { stream, usage };
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/llm.test.ts`
Expected: PASS(4 个)

- [ ] **Step 5: Commit**

```bash
git add src/server/providers/llm src/lib/openai-sse.ts tests/llm.test.ts
git commit -m "feat: OpenAI 兼容 LLM 适配器(deepseek/qwen)与降级链(重试+熔断)"
```

---

### Task 5: 搜索适配器(博查/智谱)与 URL 归一化

**Files:**
- Create: `src/lib/url-norm.ts`, `src/lib/prices.ts`, `src/server/providers/search/types.ts`, `src/server/providers/search/bocha.ts`, `src/server/providers/search/zhipu.ts`, `src/server/providers/search/chain.ts`
- Test: `tests/url-norm.test.ts`, `tests/search.test.ts`

**Interfaces:**
- Consumes: `config.BOCHA_API_KEY` / `ZHIPU_API_KEY`
- Produces: `SearchEngine = 'bocha'|'zhipu_std'|'zhipu_pro'|'zhipu_sogou'`;`SearchHit { title; url; urlNorm; snippet(≤200字); publishedAt?; engine }`;`SearchOpts { count?; signal? }`;`SearchProvider { name: SearchEngine; search(query, opts) → Promise<SearchHit[]> }`;`createSearchChain(providers) → { search(query, opts) → Promise<{hits; engine}> }`(首家成功即返回,即使 0 条;全抛错 → `SearchAllFailedError`);`normalizeUrl(raw) → string`;`SEARCH_PRICES: Record<SearchEngine, number>`;`LLM_PRICES: { deepseek: {in,out}; qwen: {in,out} }`(元/token)

- [ ] **Step 1: 写失败测试**

`tests/url-norm.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '@/lib/url-norm';

describe('normalizeUrl', () => {
  it('去 utm 与常见追踪参数', () => {
    expect(normalizeUrl('https://Example.com/a?utm_source=x&utm_medium=y&id=1'))
      .toBe('https://example.com/a?id=1');
  });
  it('去锚点、主机小写、去尾斜杠', () => {
    expect(normalizeUrl('https://A.com/x/#sec')).toBe('https://a.com/x');
  });
  it('http/https 视为不同', () => {
    expect(normalizeUrl('http://a.com/x')).not.toBe(normalizeUrl('https://a.com/x'));
  });
});
```

`tests/search.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createBocha } from '@/server/providers/search/bocha';
import { createZhipu } from '@/server/providers/search/zhipu';
import { createSearchChain, SearchAllFailedError } from '@/server/providers/search/chain';
import type { SearchProvider } from '@/server/providers/search/types';

const jsonResp = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('bocha', () => {
  it('映射 webPages.value → SearchHit,snippet 截 200', async () => {
    const fetchMock = vi.fn(async () => jsonResp({ data: { webPages: { value: [
      { name: '云龙县志', url: 'https://dfz.yn.gov.cn/a?utm_source=x', summary: '长'.repeat(300), dateLastCrawled: '2024-01-01' },
    ] } } }));
    const hits = await createBocha(() => 'k').search('云龙县 历史', { fetchImpl: fetchMock as unknown as typeof fetch } as never);
    expect(hits[0].title).toBe('云龙县志');
    expect(hits[0].urlNorm).toBe('https://dfz.yn.gov.cn/a');
    expect(hits[0].snippet.length).toBe(200);
    expect(hits[0].engine).toBe('bocha');
  });
});

describe('zhipu', () => {
  it('映射 search_result,engine 正确', async () => {
    const fetchMock = vi.fn(async () => jsonResp({ search_result: [ { title: 't', link: 'https://z.com/1', content: 'c', publish_date: '2023-05-01' } ] }));
    const hits = await createZhipu('zhipu_sogou', () => 'k').search('q', { fetchImpl: fetchMock as unknown as typeof fetch } as never);
    expect(hits[0].url).toBe('https://z.com/1');
    expect(hits[0].engine).toBe('zhipu_sogou');
  });
});

describe('search chain', () => {
  const p = (name: any, impl: () => Promise<any[]>): SearchProvider => ({ name, search: impl });
  it('首家成功即返回(即使空结果)', async () => {
    const chain = createSearchChain([p('bocha', async () => [])]);
    const r = await chain.search('q', {});
    expect(r.hits).toEqual([]);
    expect(r.engine).toBe('bocha');
  });
  it('首家抛错 → 备选', async () => {
    const chain = createSearchChain([
      p('bocha', async () => { throw new Error('boom'); }),
      p('zhipu_std', async () => [{ title: 'a', url: 'https://a', urlNorm: 'https://a', snippet: '', engine: 'zhipu_std' }]),
    ]);
    const r = await chain.search('q', {});
    expect(r.engine).toBe('zhipu_std');
  });
  it('全抛错 → SearchAllFailedError', async () => {
    const chain = createSearchChain([p('bocha', async () => { throw new Error('x'); })]);
    await expect(chain.search('q', {})).rejects.toThrow(SearchAllFailedError);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/url-norm.test.ts tests/search.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/lib/url-norm.ts`:
```ts
const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'from', 'share_token', 'scene'];

export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}
```

`src/lib/prices.ts`:
```ts
import type { SearchEngine } from '@/server/providers/search/types';

// 元/次;LLM 元/token。以各家控制台当前价为准,M0 实测时复核
export const SEARCH_PRICES: Record<SearchEngine, number> = {
  bocha: 0.036, zhipu_std: 0.01, zhipu_pro: 0.03, zhipu_sogou: 0.05,
};
export const LLM_PRICES = {
  deepseek: { in: 2e-6, out: 8e-6 },
  qwen: { in: 8e-7, out: 2e-6 },
};
```

`src/server/providers/search/types.ts`:
```ts
export type SearchEngine = 'bocha' | 'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou';
export interface SearchHit {
  title: string; url: string; urlNorm: string;
  snippet: string; publishedAt?: string; engine: SearchEngine;
}
export interface SearchOpts { count?: number; signal?: AbortSignal; fetchImpl?: typeof fetch }
export interface SearchProvider {
  readonly name: SearchEngine;
  search(query: string, opts: SearchOpts): Promise<SearchHit[]>;
}
export class SearchAllFailedError extends Error {
  constructor(detail: string) { super(`搜索全部失败: ${detail}`); }
}
```

`src/server/providers/search/bocha.ts`:
```ts
import { normalizeUrl } from '@/lib/url-norm';
import type { SearchHit, SearchOpts, SearchProvider } from './types';

const BOCHA_URL = 'https://api.bochaai.com/v1/web-search';

export function createBocha(getKey: () => string): SearchProvider {
  return {
    name: 'bocha',
    async search(query, opts: SearchOpts) {
      const key = getKey();
      if (!key) throw new Error('bocha: 缺少 API key');
      const f = opts.fetchImpl ?? fetch;
      const resp = await f(BOCHA_URL, {
        method: 'POST',
        signal: opts.signal ?? AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, count: opts.count ?? 10, freshness: 'noLimit', summary: true, page: 1 }),
      });
      if (!resp.ok) throw new Error(`bocha: HTTP ${resp.status}`);
      const j = await resp.json();
      const values: any[] = j?.data?.webPages?.value ?? [];
      return values
        .map((v) => ({
          title: String(v?.name ?? v?.title ?? ''),
          url: String(v?.url ?? ''),
          urlNorm: normalizeUrl(String(v?.url ?? '')),
          snippet: String(v?.summary ?? v?.snippet ?? '').slice(0, 200),
          publishedAt: v?.dateLastCrawled ?? v?.publishDate ?? undefined,
          engine: 'bocha' as const,
        }))
        .filter((h) => h.url.startsWith('http'));
    },
  };
}
```

`src/server/providers/search/zhipu.ts`:
```ts
import { normalizeUrl } from '@/lib/url-norm';
import type { SearchEngine, SearchHit, SearchOpts, SearchProvider } from './types';

const ZHIPU_TOOLS_URL = 'https://open.bigmodel.cn/api/paas/v4/tools';
const ENGINE_PARAM: Record<'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou', string> = {
  zhipu_std: 'search_std', zhipu_pro: 'search_pro', zhipu_sogou: 'search_pro_sogou',
};

export function createZhipu(engine: 'zhipu_std' | 'zhipu_pro' | 'zhipu_sogou', getKey: () => string): SearchProvider {
  return {
    name: engine,
    async search(query, opts: SearchOpts) {
      const key = getKey();
      if (!key) throw new Error(`${engine}: 缺少 API key`);
      const f = opts.fetchImpl ?? fetch;
      const resp = await f(ZHIPU_TOOLS_URL, {
        method: 'POST',
        signal: opts.signal ?? AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          tool: 'web_search',
          messages: [{ role: 'user', content: query }],
          search_engine: ENGINE_PARAM[engine],
          count: opts.count ?? 10,
        }),
      });
      if (!resp.ok) throw new Error(`${engine}: HTTP ${resp.status}`);
      const j = await resp.json();
      const list: any[] = j?.search_result ?? j?.data?.search_result ?? [];
      return list
        .map((v) => ({
          title: String(v?.title ?? ''),
          url: String(v?.link ?? v?.url ?? ''),
          urlNorm: normalizeUrl(String(v?.link ?? v?.url ?? '')),
          snippet: String(v?.content ?? '').slice(0, 200),
          publishedAt: v?.publish_date ?? v?.date_published ?? undefined,
          engine: engine as SearchEngine,
        }))
        .filter((h) => h.url.startsWith('http'));
    },
  };
}
```

`src/server/providers/search/chain.ts`:
```ts
import { SearchAllFailedError, type SearchEngine, type SearchHit, type SearchOpts, type SearchProvider } from './types';

export interface SearchChain {
  search(query: string, opts: SearchOpts): Promise<{ hits: SearchHit[]; engine: SearchEngine }>;
}

export function createSearchChain(providers: SearchProvider[]): SearchChain {
  return {
    async search(query, opts) {
      const errs: string[] = [];
      for (const p of providers) {
        try {
          const hits = await p.search(query, opts);
          return { hits, engine: p.name };
        } catch (e) {
          errs.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      throw new SearchAllFailedError(errs.join(' | '));
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/url-norm.test.ts tests/search.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/lib/url-norm.ts src/lib/prices.ts src/server/providers/search tests
git commit -m "feat: 博查/智谱搜索适配器、URL 归一化、价格表与降级链"
```

---

### Task 6: Fetcher(readability 抽正文 + robots)

**Files:**
- Create: `src/server/providers/fetch/readability.ts`, `src/server/providers/fetch/fetcher.ts`
- Test: `tests/fetcher.test.ts`

**Interfaces:**
- Consumes: 无外部接口(注入 fetchImpl)
- Produces: `htmlToText(html) → { title; text }`(text 截断 8000 字);`FetchedPage { url; title; text; chars; ok; reason? }`;`Fetcher { fetch(url, signal?) → Promise<FetchedPage> }`;`createFetcher(robots, fetchImpl?) → Fetcher`;`RobotsGuard { allowed(url) → Promise<boolean> }`(User-agent:\* 组 Disallow 前缀匹配,按 host 缓存 30 分钟)

- [ ] **Step 1: 写失败测试**

`tests/fetcher.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { htmlToText } from '@/server/providers/fetch/readability';
import { createFetcher, RobotsGuard } from '@/server/providers/fetch/fetcher';

describe('htmlToText', () => {
  it('去 script/style、标签转行、实体解码、截 8000', () => {
    const html = `<html><head><title>云龙县志</title><script>var x=1;</script><style>.a{}</style></head>
      <body><h1>建制沿革</h1><p>汉武帝&nbsp;置比苏县&amp;县治所在</p><script>bad()</script></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('云龙县志');
    expect(text).toContain('建制沿革');
    expect(text).toContain('汉武帝 置比苏县&县治所在');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('bad(');
    expect(text.length).toBeLessThanOrEqual(8000);
  });
});

describe('RobotsGuard + fetcher', () => {
  it('robots 禁止 → ok:false reason:robots,不发页面请求', async () => {
    const pageFetch = vi.fn();
    const robotsFetch = vi.fn(async () => new Response('User-agent: *\nDisallow: /private/', { status: 200 }));
    const fetchImpl = vi.fn(async (url: any) => String(url).endsWith('/robots.txt') ? robotsFetch() : pageFetch());
    const guard = new RobotsGuard(fetchImpl as any);
    const fetcher = createFetcher(guard, fetchImpl as any);
    const page = await fetcher.fetch('https://x.com/private/a.html');
    expect(page.ok).toBe(false);
    expect(page.reason).toBe('robots');
    expect(pageFetch).not.toHaveBeenCalled();
  });
  it('正常抓取 → 提取正文', async () => {
    const fetchImpl = vi.fn(async (url: any) => String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow:', { status: 200 })
      : new Response('<html><head><title>T</title></head><body><p>正文段落</p></body></html>', { headers: { 'content-type': 'text/html' } }));
    const guard = new RobotsGuard(fetchImpl as any);
    const fetcher = createFetcher(guard, fetchImpl as any);
    const page = await fetcher.fetch('https://y.com/doc');
    expect(page.ok).toBe(true);
    expect(page.text).toContain('正文段落');
    expect(page.title).toBe('T');
  });
  it('非 html → ok:false reason:not_html', async () => {
    const fetchImpl = vi.fn(async (url: any) => String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow:', { status: 200 })
      : new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const fetcher = createFetcher(new RobotsGuard(fetchImpl as any), fetchImpl as any);
    expect((await fetcher.fetch('https://z.com/api')).reason).toBe('not_html');
  });
});

import { vi } from 'vitest';
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/fetcher.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/providers/fetch/readability.ts`:
```ts
export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const decoded = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
  const text = decoded
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text: text.slice(0, 8000) };
}
```

`src/server/providers/fetch/fetcher.ts`:
```ts
import { htmlToText } from './readability';

export interface FetchedPage { url: string; title: string; text: string; chars: number; ok: boolean; reason?: string }
export interface Fetcher { fetch(url: string, signal?: AbortSignal): Promise<FetchedPage> }
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const UA = 'ShidiBot/0.1 (+https://localhost; research use; respects robots.txt)';

export class RobotsGuard {
  private cache = new Map<string, { rules: string[]; at: number }>();
  constructor(private fetchImpl: FetchImpl = globalThis.fetch as FetchImpl) {}
  async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const hit = this.cache.get(u.hostname);
    let rules: string[];
    if (hit && Date.now() - hit.at < 30 * 60_000) rules = hit.rules;
    else {
      try {
        const resp = await this.fetchImpl(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA } });
        rules = resp.ok ? parseDisallow(await resp.text()) : [];
      } catch { rules = []; }
      this.cache.set(u.hostname, { rules, at: Date.now() });
    }
    return !rules.some((prefix) => prefix === '' ? false : u.pathname.startsWith(prefix));
  }
}

function parseDisallow(txt: string): string[] {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups: Array<{ agents: string[]; disallow: string[] }> = [];
  for (const line of lines) {
    const m = line.match(/^(user-agent|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, val] = m;
    if (key.toLowerCase() === 'user-agent') {
      groups.push({ agents: [val.toLowerCase()], disallow: [] });
    } else {
      for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i].agents.includes('*')) groups[i].disallow.push(val);
        else break;
      }
    }
  }
  const star = groups.filter((g) => g.agents.includes('*'));
  return star.flatMap((g) => g.disallow);
}

export function createFetcher(robots: RobotsGuard, fetchImpl: FetchImpl = globalThis.fetch as FetchImpl): Fetcher {
  return {
    async fetch(url, signal) {
      try {
        if (!(await robots.allowed(url))) return { url, title: '', text: '', chars: 0, ok: false, reason: 'robots' };
        const resp = await fetchImpl(url, {
          signal: signal ?? AbortSignal.timeout(15_000),
          headers: { 'user-agent': UA },
        });
        if (!resp.ok) return { url, title: '', text: '', chars: 0, ok: false, reason: `http_${resp.status}` };
        const ct = resp.headers.get('content-type') ?? '';
        if (!ct.includes('html')) return { url, title: '', text: '', chars: 0, ok: false, reason: 'not_html' };
        const { title, text } = htmlToText(await resp.text());
        return { url, title, text, chars: text.length, ok: true };
      } catch {
        return { url, title: '', text: '', chars: 0, ok: false, reason: 'error' };
      }
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/fetcher.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/server/providers/fetch tests/fetcher.test.ts
git commit -m "feat: readability 抓取器(robots 守卫、15s 超时、8K 截断)"
```

---

### Task 7: 研究 Prompt v1(D2 落地,闭源资产)

**Files:**
- Create: `src/private/prompts.ts`
- Test: `tests/prompts.test.ts`

**Interfaces:**
- Consumes: `ChatMsg`(Task 4)、`Direction`/`PlaceInput`(Task 2)
- Produces: `planningMessages(place: { name; province; county }, direction: Direction, extra?) → ChatMsg[]`;`synthesisMessages(place: { name; province; county }, direction: Direction, plan: string[], sourcePack: string, pagesPack: string) → ChatMsg[]`;`scarceMessages(place: { name; province; county }, adminContext: string, snippets: string) → ChatMsg[]`;`parsePlan(llmOutput: string) → string[]`(容错提取 JSON 或按行拆分,≤8 条)

- [ ] **Step 1: 写失败测试**

`tests/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planningMessages, synthesisMessages, scarceMessages, parsePlan } from '@/private/prompts';

const place = { name: '云南省大理州云龙县诺邓村', province: '云南省', county: '云龙县' };

describe('prompts v1', () => {
  it('planning: 要求 JSON 子问题,注入地点/方向/补充', () => {
    const msgs = planningMessages(place, '战争军事', '重点看抗战');
    expect(msgs[0].role).toBe('system');
    const user = msgs[1].content;
    expect(user).toContain('诺邓村');
    expect(user).toContain('战争军事');
    expect(user).toContain('重点看抗战');
    expect(user).toContain('subQuestions');
  });
  it('synthesis: 含资料编号、引用规则与章节结构', () => {
    const msgs = synthesisMessages(place, '综合沿革', ['q1'], '[1] 资料 A', '[1] 正文摘录');
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toContain('[1] 资料 A');
    expect(all).toContain('建制沿革');
    expect(all.toContain ? true : true).toBe(true);
    expect(all).toMatch(/\[n\]/);
    expect(all).toContain('不得编造');
  });
  it('scarce: 声明稀缺与禁止编造', () => {
    const msgs = scarceMessages(place, '大理白族自治州云龙县', '片段');
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toContain('资料稀缺');
    expect(all).toContain('不得编造');
  });
});

describe('parsePlan', () => {
  it('标准 JSON', () => {
    expect(parsePlan('好的\n{"subQuestions":["a?","b?"]}')).toEqual(['a?', 'b?']);
  });
  it('代码围栏 JSON', () => {
    expect(parsePlan('```json\n{"subQuestions":["a?"]}\n```')).toEqual(['a?']);
  });
  it('非 JSON 时按行兜底', () => {
    const out = parsePlan('1. 秦汉建制?\n2. 明清变迁?');
    expect(out).toEqual(['秦汉建制?', '明清变迁?']);
  });
  it('兜底后超 8 条截断', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `${i + 1}. 问题${i}是什么?`).join('\n');
    expect(parsePlan(lines).length).toBe(8);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/prompts.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/private/prompts.ts`(本文件即 D2 v1 的代码形态,M0 结束随 `scripts/locations.json` 一起拆到私有仓库):
```ts
import type { ChatMsg } from '@/server/providers/llm/types';
import type { Direction } from '@/lib/types';

export interface PromptPlace { name: string; province: string; county: string }

const PLANNING_SYSTEM = `你是资深中国历史地理研究员。根据地点与研究方向,规划深度检索的中文子问题。
要求:5-8 个;每个子问题独立、具体、可直接搜索(含朝代、事件、机构、地名等实体);互不重复;优先能被地方志、百科、学术论文、权威媒体报道回答的问题。
只输出 JSON,格式:{"subQuestions":["..."]},不要输出其他内容。`;

export function planningMessages(place: PromptPlace, direction: Direction, extra?: string): ChatMsg[] {
  return [
    { role: 'system', content: PLANNING_SYSTEM },
    { role: 'user', content: `地点:${place.name}(位于${place.province}${place.county})\n研究方向:${direction}${extra ? `\n用户补充要求:${extra}` : ''}\n\n请给出研究子问题。` },
  ];
}

const SYNTHESIS_SYSTEM = `你是中文历史写作研究员,面向文史爱好者撰写地点历史报告。
硬性规则:
1. 只允许使用给定资料中的信息,不得编造;资料未覆盖的内容直接略过。
2. 引用只能用资料编号 [n] 形式,编号必须来自给定资料列表,禁止自创编号。
3. 文风通俗但严谨,拒绝导游腔与抒情堆砌;不确定的表述用"据……记载"并紧跟引用。
4. 直接输出 markdown 正文,不要输出"来源列表"(系统自动生成)。`;

export function synthesisMessages(place: PromptPlace, direction: Direction, plan: string[], sourcePack: string, pagesPack: string): ChatMsg[] {
  return [
    { role: 'system', content: SYNTHESIS_SYSTEM },
    { role: 'user', content: `地点:${place.name}\n研究方向:${direction}\n研究子问题:\n${plan.map((q, i) => `${i + 1}. ${q}`).join('\n')}

【资料编号】(引用只准用这些编号)
${sourcePack}

【正文摘录】
${pagesPack || '(无正文,依据编号资料的摘要作答)'}

写作要求:
- 章节:## 建制沿革、## 重大事件、## 文化风俗、## 文物遗存、## 近现代变迁;资料不足的章节可合并或省略,但建制沿革必须写。
- 每节 2-4 段,全文 1200-2500 字。
- 每段至少有一处 [n] 引用支撑关键事实。` },
  ];
}

export function scarceMessages(place: PromptPlace, adminContext: string, snippets: string): ChatMsg[] {
  return [
    { role: 'system', content: `${SYNTHESIS_SYSTEM}\n本次资料极度稀缺:只写有把握的内容。` },
    { role: 'user', content: `地点:${place.name}(行政区划:${adminContext})
可用资料极少,摘要如下:
${snippets || '(几乎无可用资料)'}

只写两节:## 建制沿革(仅基于政区层级与通名常识)与 ## 自然地理(基于所属区域的地理常识)。
第一行必须输出引用块:> ⚠️ 公开资料稀缺,以下为该地行政区划与地理背景,不含未经证实的细节。
严禁编造具体年代、人名、事件。全文 400-800 字。` },
  ];
}

export function parsePlan(out: string): string[] {
  const m = out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { subQuestions?: unknown };
      if (Array.isArray(j.subQuestions)) {
        const qs = j.subQuestions.filter((q): q is string => typeof q === 'string' && q.trim().length > 2);
        if (qs.length) return qs.slice(0, 8);
      }
    } catch { /* fallthrough */ }
  }
  const lines = out
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[.、)]\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((l) => l.length > 4 && !l.startsWith('{') && !l.startsWith('```'));
  return (lines.length ? lines : ['该地历史沿革与现状']).slice(0, 8);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/prompts.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/private/prompts.ts tests/prompts.test.ts
git commit -m "feat: 研究 prompt v1(规划/综合/稀缺)+ 容错解析(D2 落地)"
```

---

### Task 8: 引用管线(sourcePack + 幻觉剔除)

**Files:**
- Create: `src/server/orchestrator/citations.ts`
- Test: `tests/citations.test.ts`

**Interfaces:**
- Consumes: `SourceRow`(Task 3,只用 idx/title/url/snippet/published_at 字段)
- Produces: `buildSourcePack(kept) → string`;`validateCitations(report, maxIdx) → { report; invalidCount }`(剔除 1..maxIdx 之外的 `[n]` 并计数)

- [ ] **Step 1: 写失败测试**

`tests/citations.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSourcePack, validateCitations } from '@/server/orchestrator/citations';

describe('buildSourcePack', () => {
  it('编号·标题·域名·日期+摘要', () => {
    const pack = buildSourcePack([
      { idx: 1, title: '云龙县志', url: 'https://dfz.yn.gov.cn/a', snippet: '摘要一', published_at: '2021-03-01' },
      { idx: 2, title: '诺邓', url: 'https://b.com/x', snippet: '摘要二', published_at: null },
    ]);
    expect(pack).toContain('[1] 云龙县志 · dfz.yn.gov.cn · 2021-03-01');
    expect(pack).toContain('摘要一');
    expect(pack).toContain('日期未知');
  });
});

describe('validateCitations', () => {
  it('保留合法编号,剔除越界与自创编号并计数', () => {
    const r = validateCitations('秦置[1],唐置[2],伪引[9]与[0]与[abc]', 2);
    expect(r.report).toBe('秦置[1],唐置[2],伪引与与[abc]');
    expect(r.invalidCount).toBe(2);
  });
  it('无引用时零改动', () => {
    const r = validateCitations('纯文本[3]', 5);
    expect(r.report).toBe('纯文本[3]');
    expect(r.invalidCount).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/citations.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/orchestrator/citations.ts`:
```ts
interface SourceLike { idx: number; title: string; url: string; snippet: string; published_at?: string | null }

export function buildSourcePack(kept: SourceLike[]): string {
  return kept
    .map((s) => {
      let host = '';
      try { host = new URL(s.url).hostname; } catch { host = 'unknown'; }
      return `[${s.idx}] ${s.title} · ${host} · ${s.published_at ?? '日期未知'}\n${s.snippet}`;
    })
    .join('\n\n');
}

export function validateCitations(report: string, maxIdx: number): { report: string; invalidCount: number } {
  let invalidCount = 0;
  const report2 = report.replace(/\[(\d{1,3})\]/g, (m, n: string) => {
    const i = Number(n);
    return i >= 1 && i <= maxIdx ? m : (invalidCount++, '');
  });
  return { report: report2, invalidCount };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/citations.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/server/orchestrator/citations.ts tests/citations.test.ts
git commit -m "feat: 引用编号包构建与幻觉引用剔除"
```

---

### Task 9: 状态机 / 事件总线 / 任务注册表

**Files:**
- Create: `src/server/orchestrator/machine.ts`, `src/server/orchestrator/events.ts`, `src/instrumentation.ts`
- Test: `tests/machine.test.ts`, `tests/events.test.ts`

**Interfaces:**
- Consumes: `Repo.sweepStaleTasks`(Task 3)
- Produces: `canTransition(from, to) → boolean`;`TERMINAL_STATUSES: readonly string[]`;`BUDGETS_MS`(字段:planning/searchQuery/searchRound/searchTotal/fetchUrl/fetchTotal/synthesize/scarce/taskHard,值见 TDD §3);`TaskRegistry`(register/release/abort/abortAll)+ 单例 `registry`;`TaskEventBus`(subscribe(taskId, fn) → 退订函数;emit(taskId, event, data))+ 单例 `bus`

- [ ] **Step 1: 写失败测试**

`tests/machine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { canTransition, BUDGETS_MS, TaskRegistry } from '@/server/orchestrator/machine';

describe('canTransition', () => {
  it('主链合法', () => {
    for (const [a, b] of [['queued','planning'],['planning','searching'],['searching','fetching'],['fetching','synthesizing'],['synthesizing','completed'],['searching','scarce']] as const)
      expect(canTransition(a, b), `${a}→${b}`).toBe(true);
  });
  it('任何非终态 → failed 合法', () => {
    for (const s of ['queued','planning','searching','fetching','synthesizing'])
      expect(canTransition(s, 'failed')).toBe(true);
  });
  it('终态不可离开,不可跳跃', () => {
    expect(canTransition('completed', 'failed')).toBe(false);
    expect(canTransition('queued', 'synthesizing')).toBe(false);
    expect(canTransition('scarce', 'completed')).toBe(false);
  });
});

describe('BUDGETS_MS 与 TDD §3 一致', () => {
  it('数值', () => {
    expect(BUDGETS_MS.planning).toBe(60_000);
    expect(BUDGETS_MS.searchQuery).toBe(15_000);
    expect(BUDGETS_MS.searchTotal).toBe(150_000);
    expect(BUDGETS_MS.fetchUrl).toBe(15_000);
    expect(BUDGETS_MS.fetchTotal).toBe(60_000);
    expect(BUDGETS_MS.synthesize).toBe(180_000);
    expect(BUDGETS_MS.scarce).toBe(90_000);
    expect(BUDGETS_MS.taskHard).toBe(600_000);
  });
});

describe('TaskRegistry', () => {
  it('register/abort/abortAll', () => {
    const r = new TaskRegistry();
    const a = r.register('t1');
    r.register('t2');
    expect(r.size).toBe(2);
    let aborted = false;
    a.signal.addEventListener('abort', () => { aborted = true; });
    r.abortAll();
    expect(aborted).toBe(true);
    r.release('t1'); r.release('t2');
    expect(r.size).toBe(0);
  });
});
```

`tests/events.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { TaskEventBus } from '@/server/orchestrator/events';

describe('TaskEventBus', () => {
  it('emit 到订阅者,退订后不再收到', () => {
    const bus = new TaskEventBus();
    const fn = vi.fn();
    const off = bus.subscribe('t1', fn);
    bus.emit('t1', 'progress', { phase: 'planning' });
    off();
    bus.emit('t1', 'done', {});
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual({ event: 'progress', data: { phase: 'planning' } });
  });
  it('不同任务互不干扰', () => {
    const bus = new TaskEventBus();
    const fnA = vi.fn(), fnB = vi.fn();
    bus.subscribe('a', fnA); bus.subscribe('b', fnB);
    bus.emit('b', 'progress', 1);
    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/machine.test.ts tests/events.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/orchestrator/machine.ts`:
```ts
export const TERMINAL_STATUSES = ['completed', 'scarce', 'failed'] as const;

const GRAPH: Record<string, readonly string[]> = {
  queued: ['planning', 'failed'],
  planning: ['searching', 'failed'],
  searching: ['fetching', 'scarce', 'failed'],
  fetching: ['synthesizing', 'scarce', 'failed'],
  synthesizing: ['completed', 'failed'],
  completed: [], scarce: [], failed: [],
};

export function canTransition(from: string, to: string): boolean {
  return (GRAPH[from] ?? []).includes(to);
}

export const BUDGETS_MS = {
  planning: 60_000,
  searchQuery: 15_000,
  searchRound: 45_000,
  searchTotal: 150_000,
  fetchUrl: 15_000,
  fetchTotal: 60_000,
  synthesize: 180_000,
  scarce: 90_000,
  taskHard: 600_000,
} as const;

export class TaskRegistry {
  private handles = new Map<string, AbortController>();
  register(id: string): AbortController {
    const c = new AbortController();
    this.handles.set(id, c);
    return c;
  }
  release(id: string): void { this.handles.delete(id); }
  abort(id: string): void { this.handles.get(id)?.abort(); }
  abortAll(): void {
    for (const c of this.handles.values()) c.abort();
    this.handles.clear();
  }
  get size(): number { return this.handles.size; }
}

export const registry = new TaskRegistry();
```

`src/server/orchestrator/events.ts`:
```ts
export interface SseEvent { event: string; data: unknown }
type Listener = (e: SseEvent) => void;

export class TaskEventBus {
  private subs = new Map<string, Set<Listener>>();
  subscribe(taskId: string, fn: Listener): () => void {
    let set = this.subs.get(taskId);
    if (!set) { set = new Set(); this.subs.set(taskId, set); }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.subs.delete(taskId);
    };
  }
  emit(taskId: string, event: string, data: unknown): void {
    for (const fn of this.subs.get(taskId) ?? []) fn({ event, data });
  }
}

export const bus = new TaskEventBus();
```

`src/instrumentation.ts`(Next 启动钩子:清陈旧任务 + 优雅停机):
```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getRepo } = await import('@/server/db/repo');
  getRepo().sweepStaleTasks();
  const { registry } = await import('@/server/orchestrator/machine');
  const shutdown = () => {
    registry.abortAll();
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/machine.test.ts tests/events.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/server/orchestrator/machine.ts src/server/orchestrator/events.ts src/instrumentation.ts tests
git commit -m "feat: 状态机(转移图/预算)、SSE 事件总线、任务注册表与停机钩子"
```

---

### Task 10: 研究流水线(编排核心)

**Files:**
- Create: `src/server/orchestrator/pipeline.ts`, `src/server/orchestrator/runner.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: 前面全部:`Repo`、`LlmProvider`/`createLlmChain`/`createDeepSeek`/`createQwen`、`SearchChain`/`createSearchChain`/`createBocha`/`createZhipu`、`Fetcher`/`createFetcher`/`RobotsGuard`、prompts 三函数、`buildSourcePack`/`validateCitations`、`bus`/`registry`/`BUDGETS_MS`、`cacheKey`、`SEARCH_PRICES`/`LLM_PRICES`
- Produces: `PipelineDeps { llm; search; fetcher; repo; cfg }`;`defaultDeps() → PipelineDeps`(真实链);`runTask(taskId, deps, signal?) → Promise<void>`;`startResearch(input: ResearchInput) → Promise<{ taskId; cached }>`(缓存命中直接回放原任务);`runner.ts`:`Runner { start(input) }` + `getRunner()` / `setRunner()`(路由用,测试可换)

- [ ] **Step 1: 写失败测试**

`tests/pipeline.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '@/server/db/client';
import { createRepo, type Repo } from '@/server/db/repo';
import { runTask, type PipelineDeps } from '@/server/orchestrator/pipeline';
import { bus } from '@/server/orchestrator/events';
import { loadConfig } from '@/lib/config';
import type { LlmProvider, LlmRequest, LlmCall } from '@/server/providers/llm/types';
import { createLlmChain } from '@/server/providers/llm/chain';
import type { SearchChain } from '@/server/providers/search/chain';
import type { Fetcher, FetchedPage } from '@/server/providers/fetch/fetcher';
import type Database from 'better-sqlite3';

let db: Database.Database, repo: Repo;
beforeEach(() => {
  db = openDb(':memory:'); migrate(db);
  repo = createRepo(db);
});

const TASK = { id: 't1', place_name: '云南省大理州云龙县诺邓村', place_json: '{"province":"云南省","city":"大理州","county":"云龙县","village":"诺邓村"}', lat: 25.88, lng: 99.15, direction: '综合沿革' };

function fakeLlm(script: { plan: string; report: string }): LlmProvider {
  let calls = 0;
  return {
    name: 'deepseek',
    chatStream(req: LlmRequest): LlmCall {
      const isPlan = calls++ === 0;
      const text = isPlan ? script.plan : script.report;
      const parts = [text.slice(0, 5), text.slice(5)];
      let i = 0;
      return {
        usage: Promise.resolve({ promptTokens: 100, completionTokens: 200 }),
        stream: (async function* () { for (const p of parts) yield { delta: p }; })(),
      };
    },
  };
}

function fakeSearch(byQuery: (q: string) => { title: string; url: string; snippet: string }[]): SearchChain['search'] {
  return async (query) => ({ hits: byQuery(query).map((h) => ({ title: h.title, url: h.url, urlNorm: h.url, snippet: h.snippet, publishedAt: '2024-01-01', engine: 'bocha' as const })).slice(0, 10), engine: 'bocha' });
}

const noFetch: Fetcher = { fetch: async (url): Promise<FetchedPage> => ({ url, title: '页', text: '正文', chars: 2, ok: true }) };

function deps(over: Partial<PipelineDeps>): PipelineDeps {
  return { llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '## 建制沿革\n内容[1]。\n' }), search: { search: fakeSearch(() => [{ title: 'a', url: 'https://a/1', snippet: 's' }, { title: 'b', url: 'https://b/1', snippet: 's' }, { title: 'c', url: 'https://c/1', snippet: 's' }]) }, fetcher: noFetch, repo, cfg: loadConfig({}), ...over };
}

describe('runTask', () => {
  it('happy path: completed + 报告含来源列表 + 引用保留 + 缓存写入', async () => {
    repo.createTask(TASK);
    const events: string[] = [];
    bus.subscribe('t1', (e) => events.push(e.event));
    await runTask('t1', deps({}));
    const t = repo.getTask('t1')!;
    expect(t.status).toBe('completed');
    expect(t.report_md).toContain('## 建制沿革');
    expect(t.report_md).toContain('## 来源');
    expect(t.report_md).toContain('[1]');
    expect(t.share_token).toBeTruthy();
    expect(t.cost_json).toContain('"bocha"');
    expect(t.timings_json).toContain('totalMs');
    expect(events).toContain('progress');
    expect(events).toContain('search_hit');
    expect(events).toContain('done');
    expect(events).toContain('content');
  });
  it('kept < 3 → scarce 终态,报告带稀缺横幅', async () => {
    repo.createTask({ ...TASK, id: 't2' });
    const d = deps({ search: { search: async () => ({ hits: [{ title: '唯一', url: 'https://a/1', urlNorm: 'https://a/1', snippet: 's', engine: 'bocha' }], engine: 'bocha' }) } });
    await runTask('t2', d);
    const t = repo.getTask('t2')!;
    expect(t.status).toBe('scarce');
    expect(t.report_md).toContain('资料稀缺');
  });
  it('幻觉引用 [9] 被剔除', async () => {
    repo.createTask({ ...TASK, id: 't3' });
    await runTask('t3', deps({ llm: fakeLlm({ plan: '{"subQuestions":["q1","q2"]}', report: '正文[1]与伪引[9]。\n' }) }));
    const t = repo.getTask('t3')!;
    expect(t.report_md).toContain('[1]');
    expect(t.report_md).not.toContain('[9]');
  });
  it('搜索全抛错 → failed / search_all_failed', async () => {
    repo.createTask({ ...TASK, id: 't4' });
    const d = deps({ search: { search: async () => { throw new Error('down'); } } });
    await runTask('t4', d);
    const t = repo.getTask('t4')!;
    expect(t.status).toBe('failed');
    expect(t.error_code).toBe('search_all_failed');
  });
  it('LLM 全挂 → failed / llm_all_failed', async () => {
    repo.createTask({ ...TASK, id: 't5' });
    const badLlm: LlmProvider = { name: 'deepseek', chatStream: () => ({ usage: Promise.reject(new Error('x')), stream: (async function* () { throw new Error('x'); })() }) };
    await runTask('t5', deps({ llm: createLlmChain([badLlm]) }));
    expect(repo.getTask('t5')!.error_code).toBe('llm_all_failed');
  });
  it('自适应轮次:第 2 轮覆盖后不再跑第 3 轮', async () => {
    repo.createTask({ ...TASK, id: 't6' });
    let round = 0;
    const search: SearchChain['search'] = async (q) => {
      round++;
      // 每个 query 返回 2 条不重复源 → 两个子问题在 R1 即覆盖,R2 复核后退出
      const hits = [1, 2].map((k) => ({ title: `${q}#${k}`, url: `https://x/${round}/${k}`, urlNorm: `https://x/${round}/${k}`, snippet: 's', publishedAt: undefined, engine: 'bocha' as const }));
      return { hits, engine: 'bocha' };
    };
    await runTask('t6', deps({ search: { search } }));
    const tl = JSON.parse(repo.getTask('t6')!.timeline_json) as Array<{ note: string }>;
    const roundNotes = tl.filter((e) => e.note.includes('轮'));
    expect(roundNotes.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/orchestrator/pipeline.ts`:
```ts
import { nanoid } from 'nanoid';
import { config, loadConfig, type Config } from '@/lib/config';
import { cacheKey } from '@/lib/cache-key';
import { placeDisplayName, type Direction, type PlaceInput, type ResearchInput } from '@/lib/types';
import { SEARCH_PRICES, LLM_PRICES } from '@/lib/prices';
import { getRepo, type Repo } from '@/server/db/repo';
import type { LlmProvider, ChatMsg } from '@/server/providers/llm/types';
import { createLlmChain } from '@/server/providers/llm/chain';
import { createDeepSeek } from '@/server/providers/llm/deepseek';
import { createQwen } from '@/server/providers/llm/qwen';
import type { SearchChain } from '@/server/providers/search/chain';
import { createSearchChain } from '@/server/providers/search/chain';
import { createBocha } from '@/server/providers/search/bocha';
import { createZhipu } from '@/server/providers/search/zhipu';
import type { Fetcher } from '@/server/providers/fetch/fetcher';
import { createFetcher, RobotsGuard } from '@/server/providers/fetch/fetcher';
import { planningMessages, synthesisMessages, scarceMessages, parsePlan } from '@/private/prompts';
import { buildSourcePack, validateCitations } from './citations';
import { bus } from './events';
import { registry, BUDGETS_MS } from './machine';
import type { SearchHit } from '@/server/providers/search/types';
import { LlmAllFailedError } from '@/server/providers/llm/types';
import { SearchAllFailedError } from '@/server/providers/search/types';

export interface PipelineDeps {
  llm: LlmProvider;
  search: SearchChain;
  fetcher: Fetcher;
  repo: Repo;
  cfg: Config;
}

export function defaultDeps(): PipelineDeps {
  const cfg = config;
  const searchChain =
    cfg.SEARCH_MODE === 'zhipu'
      ? [createZhipu('zhipu_std', () => cfg.ZHIPU_API_KEY), createBocha(() => cfg.BOCHA_API_KEY)]
      : [createBocha(() => cfg.BOCHA_API_KEY), createZhipu('zhipu_std', () => cfg.ZHIPU_API_KEY)];
  return {
    cfg,
    llm: createLlmChain([createDeepSeek(), createQwen()]),
    search: createSearchChain(searchChain),
    fetcher: createFetcher(new RobotsGuard()),
    repo: getRepo(),
  };
}

function domainWeight(host: string): number {
  if (/\.gov(\.cn)?$/.test(host)) return 2;
  if (/\.edu(\.cn)?$/.test(host)) return 2;
  if (/zhihu\.com$/.test(host)) return 1;
  if (/baike\.(baidu|sogou)\.com$/.test(host)) return 1;
  if (/wikipedia\.org$/.test(host)) return 1;
  if (/weibo\.com$/.test(host)) return -1;
  return 0;
}

export function scoreHit(hit: SearchHit, placeName: string): number {
  let s = 0;
  try { s += domainWeight(new URL(hit.url).hostname); } catch { /* bad url */ }
  if (hit.title.includes(placeName)) s += 2;
  if (hit.snippet.includes(placeName)) s += 1;
  if (hit.title.length > 60) s -= 0.5;
  return s;
}

export async function runTask(taskId: string, deps: PipelineDeps, signal?: AbortSignal): Promise<void> {
  const { repo, cfg } = deps;
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const searchCalls: Record<string, number> = {};
  let tokIn = 0, tokOut = 0;

  const cost = () => {
    let yuan = 0;
    for (const [e, n] of Object.entries(searchCalls)) yuan += (SEARCH_PRICES[e as keyof typeof SEARCH_PRICES] ?? 0) * n;
    yuan += tokIn * LLM_PRICES.deepseek.in + tokOut * LLM_PRICES.deepseek.out;
    return { searchCalls, llmTokens: { in: tokIn, out: tokOut }, yuan: Number(yuan.toFixed(4)) };
  };

  const emit = (event: string, data: unknown) => bus.emit(taskId, event, data);
  const phase = (status: string, note: string, round?: number) => {
    repo.updateTask(taskId, { status });
    repo.appendTimeline(taskId, { phase: status, note, round, ts: Date.now() });
    emit('progress', { phase: status, round, note, ts: Date.now() });
  };
  const finish = (status: 'completed' | 'scarce' | 'failed', extra: Record<string, unknown>) => {
    repo.updateTask(taskId, { status, finished_at: Date.now(), ...extra, cost_json: JSON.stringify(cost()), timings_json: JSON.stringify({ ...timings, totalMs: Date.now() - t0 }) });
  };

  try {
    const task = repo.getTask(taskId);
    if (!task) return;
    const place = JSON.parse(task.place_json) as PlaceInput;
    const promptPlace = { name: task.place_name, province: place.province, county: place.county };

    // ---- planning ----
    const tp = Date.now();
    phase('planning', '正在拆解研究子问题');
    let plan: string[];
    {
      const call = deps.llm.chatStream({ model: cfg.DEEPSEEK_MODEL, messages: planningMessages(promptPlace, task.direction as Direction, task.extra_instruction ?? undefined), temperature: 0.3, signal });
      let out = '';
      for await (const c of call.stream) out += c.delta ?? '';
      const u = await call.usage;
      tokIn += u.promptTokens; tokOut += u.completionTokens;
      plan = parsePlan(out);
      repo.updateTask(taskId, { plan_json: JSON.stringify(plan) });
    }
    timings.planningMs = Date.now() - tp;

    // ---- searching(自适应多轮) ----
    const ts = Date.now();
    phase('searching', '开始多轮检索', 0);
    const kept = new Map<string, { hit: SearchHit; subQ: number }>();
    const coverage = new Array<number>(plan.length).fill(0);
    let anySearchOk = false;
    let round = 0;
    while (round < 6 && Date.now() - ts < BUDGETS_MS.searchTotal) {
      const open = plan.map((_, i) => i).filter((i) => coverage[i] < 2);
      if (round >= 2 && open.length === 0) break;
      round++;
      const targets = (open.length ? open : plan.map((_, i) => i)).slice(0, 3);
      const queries = targets.map((i) => `${task.place_name} ${plan[i]}`);
      const results = await Promise.allSettled(queries.map((q) => deps.search.search(q, { count: 10, signal })));
      const fresh: SearchHit[] = [];
      results.forEach((r, qi) => {
        if (r.status !== 'fulfilled') return;
        anySearchOk = true;
        searchCalls[r.value.engine] = (searchCalls[r.value.engine] ?? 0) + 1;
        for (const h of r.value.hits) {
          const subQ = targets[qi];
          const prev = kept.get(h.urlNorm);
          if (prev) { coverage[prev.subQ]++; continue; }
          kept.set(h.urlNorm, { hit: h, subQ });
          fresh.push(h);
          coverage[subQ]++;
        }
      });
      for (const h of fresh) {
        repo.insertSource({ task_id: taskId, idx: null, stage: 'candidate', title: h.title, url: h.url, url_norm: h.urlNorm, snippet: h.snippet, published_at: h.publishedAt ?? null, engine: h.engine, score: null, fetched_chars: null, quote: null });
      }
      emit('search_hit', { round, query: queries[0], engine: results[0]?.status === 'fulfilled' ? results[0].value.engine : null, found: fresh.length, kept: fresh.slice(0, 5).map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })) });
      repo.appendTimeline(taskId, { phase: 'searching', note: `第 ${round} 轮检索,新增 ${fresh.length} 源`, round, ts: Date.now() });
      if (!open.length) break;
    }
    timings.searchingMs = Date.now() - ts;
    if (kept.size === 0 && !anySearchOk) throw new SearchAllFailedError('所有轮次搜索均失败');

    const keptList = [...kept.values()]
      .map((v) => ({ hit: v.hit, score: scoreHit(v.hit, task.place_name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, cfg.REPORT_MAX_SOURCES)
      .map((x, i) => ({ ...x.hit, idx: i + 1, score: x.score }));
    repo.dropCandidates(taskId);
    const rowIdByUrlNorm = new Map<string, number>();
    for (const k of keptList) {
      const rowId = repo.insertSource({ task_id: taskId, idx: k.idx, stage: 'kept', title: k.title, url: k.url, url_norm: k.urlNorm, snippet: k.snippet, published_at: k.publishedAt ?? null, engine: k.engine, score: k.score, fetched_chars: null, quote: null });
      rowIdByUrlNorm.set(k.urlNorm, rowId);
    }

    const synthesize = async (msgs: ChatMsg[]): Promise<string> => {
      phase('synthesizing', '综合成文');
      const tSyn = Date.now();
      const call = deps.llm.chatStream({ model: cfg.DEEPSEEK_MODEL, messages: msgs, temperature: 0.5, maxTokens: 4096, signal });
      let full = '', held = '';
      for await (const c of call.stream) {
        const d = c.delta ?? '';
        if (!d) continue;
        full += d; held += d;
        emit('content', { delta: d });
        if (held.length >= 2048) { repo.saveReportDelta(taskId, held); held = ''; }
      }
      if (held) repo.saveReportDelta(taskId, held);
      const u = await call.usage;
      tokIn += u.promptTokens; tokOut += u.completionTokens;
      timings.synthesizingMs = Date.now() - tSyn;
      return full;
    };

    let finalStatus: 'completed' | 'scarce';
    let finalMd: string;
    let scarcity = false;

    if (keptList.length < cfg.SCARCITY_THRESHOLD) {
      // ---- scarce 降级 ----
      scarcity = true; finalStatus = 'scarce';
      repo.updateTask(taskId, { status: 'scarce' });
      repo.appendTimeline(taskId, { phase: 'scarce', note: `资料稀缺(${keptList.length} 源),降级输出`, ts: Date.now() });
      emit('progress', { phase: 'scarce', note: `资料稀缺(${keptList.length} 源),降级输出`, ts: Date.now() });
      const adminCtx = [place.province, place.city, place.county, place.village].filter(Boolean).join('');
      const raw = await synthesize(scarceMessages(promptPlace, adminCtx, keptList.map((s) => s.snippet).join('\n')));
      finalMd = `> ⚠️ 公开资料稀缺,以下为该地行政区划与地理背景,不含未经证实的细节。\n\n${raw.trim()}\n\n## 来源\n${keptList.map((s) => `${s.idx}. [${s.title}](${s.url})`).join('\n')}\n`;
    } else {
      // ---- fetching ----
      const tf = Date.now();
      phase('fetching', `抓取前 ${Math.min(keptList.length, cfg.REPORT_MAX_SOURCES)} 个来源正文`);
      const pages: string[] = [];
      const queue = [...keptList];
      const workers = Array.from({ length: Math.min(cfg.FETCH_CONCURRENCY, queue.length) }, async () => {
        while (queue.length && Date.now() - tf < BUDGETS_MS.fetchTotal) {
          const s = queue.shift()!;
          const page = await deps.fetcher.fetch(s.url, signal);
          const rowId = rowIdByUrlNorm.get(s.urlNorm)!;
          if (page.ok) {
            pages.push(`[${s.idx}] ${page.title}\n${page.text.slice(0, 1500)}`);
            repo.updateSource(rowId, { stage: 'fetched', fetched_chars: page.chars });
          }
        }
      });
      await Promise.all(workers);
      timings.fetchingMs = Date.now() - tf;

      // ---- synthesizing ----
      const raw = await synthesize(synthesisMessages(promptPlace, task.direction as Direction, plan, buildSourcePack(keptList), pages.join('\n\n')));
      const { report, invalidCount } = validateCitations(raw, keptList.length);
      if (invalidCount > 0) repo.appendTimeline(taskId, { phase: 'synthesizing', note: `剔除 ${invalidCount} 个无效引用标记`, ts: Date.now() });
      finalStatus = 'completed';
      finalMd = `${report.trim()}\n\n## 来源\n${keptList.map((s) => `${s.idx}. [${s.title}](${s.url})`).join('\n')}\n`;
    }

    repo.updateTask(taskId, { report_md: finalMd });
    for (const s of keptList) {
      const rowId = rowIdByUrlNorm.get(s.urlNorm);
      if (rowId && finalMd.includes(`[${s.idx}]`)) repo.updateSource(rowId, { stage: 'cited' });
    }
    emit('sources', { items: keptList.map((s) => ({ idx: s.idx, title: s.title, url: s.url, site: new URL(s.url).hostname, date: s.publishedAt ?? null })) });
    finish(finalStatus, { share_token: nanoid(12) });
    repo.cachePut(cacheKey(place.county, task.lat, task.lng, task.direction), taskId);
    emit('done', { taskId, status: finalStatus, elapsedMs: Date.now() - t0, sourcesKept: keptList.length, scarcity, yuan: cost().yuan });
  } catch (e) {
    const code = e instanceof LlmAllFailedError ? 'llm_all_failed'
      : e instanceof SearchAllFailedError ? 'search_all_failed'
      : (e as Error)?.name === 'AbortError' ? 'timeout'
      : 'internal';
    finish('failed', { error_code: code, error_msg: (e as Error)?.message ?? String(e) });
    emit('error', { code, message: (e as Error)?.message ?? String(e), retryable: code !== 'internal' });
  }
}

export async function startResearch(input: ResearchInput): Promise<{ taskId: string; cached: boolean }> {
  const deps = defaultDeps();
  const key = cacheKey(input.place.county, input.lat, input.lng, input.direction);
  const hit = deps.repo.cacheGet(key);
  if (hit) return { taskId: hit.task_id, cached: true };
  const id = nanoid(12);
  deps.repo.createTask({ id, place_name: placeDisplayName(input.place), place_json: JSON.stringify(input.place), lat: input.lat, lng: input.lng, direction: input.direction, extra_instruction: input.extra });
  const ac = registry.register(id);
  void runTask(id, deps, ac.signal).finally(() => registry.release(id));
  return { taskId: id, cached: false };
}
```

说明:`runTask` 内的 `bus` 直接使用 events.ts 的单例(`PipelineDeps` 不含 bus 字段),测试订阅同一个单例即可观测事件。

`src/server/orchestrator/runner.ts`:
```ts
import type { ResearchInput } from '@/lib/types';
import { startResearch } from './pipeline';

export interface Runner {
  start(input: ResearchInput): Promise<{ taskId: string; cached: boolean }>;
}

let current: Runner = { start: startResearch };

export function getRunner(): Runner { return current; }
export function setRunner(r: Runner): void { current = r; }
```

同时把 `tests/pipeline.test.ts` 里对 `PipelineDeps` 的构造改为不含 `bus` 字段(与最终接口一致),并订阅单例 `bus`;每个用例前后 `bus` 无需重置(退订即可,或忽略串扰——taskId 不同)。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: PASS(6 个)

- [ ] **Step 5: 全量回归**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/orchestrator tests/pipeline.test.ts
git commit -m "feat: 研究流水线(规划→自适应搜索→抓取→综合→引用校验→缓存)"
```

---

### Task 11: API 路由(POST SSE / GET 恢复 / GET 轮询)

**Files:**
- Create: `src/app/api/research/route.ts`, `src/app/api/research/[id]/route.ts`, `src/app/api/research/[id]/poll/route.ts`
- Modify: `src/server/db/client.ts`(追加 `__setDbForTests`)、`src/server/db/repo.ts`(追加 `__resetRepoForTests`)
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `getRunner`/`setRunner`(Task 10)、`getRepo`(Task 3)、`bus`(Task 9)、`DIRECTIONS`(Task 2)
- Produces: HTTP 端点,行为与 TDD §5/§6 完全一致(请求/响应/错误码/SSE 事件名与载荷字段)

- [ ] **Step 1: 写失败测试**

`tests/api.test.ts`(进程内直接调路由函数;内存 DB 注入 + 假 Runner,不碰网络):
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, __setDbForTests } from '@/server/db/client';
import { createRepo, getRepo, __resetRepoForTests, type Repo } from '@/server/db/repo';
import { setRunner } from '@/server/orchestrator/runner';
import { bus } from '@/server/orchestrator/events';
import { POST } from '@/app/api/research/route';
import { GET as getTaskRoute } from '@/app/api/research/[id]/route';
import { GET as pollRoute } from '@/app/api/research/[id]/poll/route';

let repo: Repo;

beforeEach(() => {
  const db = openDb(':memory:');
  __setDbForTests(db);
  __resetRepoForTests();
  repo = createRepo(db);
});

function seedRunningTask(): void {
  repo.createTask({ id: 't_api', place_name: '云南省大理州云龙县诺邓村', place_json: '{"province":"云南省","city":"大理州","county":"云龙县","village":"诺邓村"}', lat: 25.88, lng: 99.15, direction: '综合沿革' });
  repo.updateTask('t_api', { status: 'searching' });
}

function useFakeRunner(): void {
  setRunner({
    async start() {
      seedRunningTask();
      setTimeout(() => {
        repo.updateTask('t_api', { status: 'completed', report_md: '# 报告' });
        bus.emit('t_api', 'content', { delta: '# 报告' });
        bus.emit('t_api', 'done', { taskId: 't_api', status: 'completed', elapsedMs: 5, sourcesKept: 2, scarcity: false, yuan: 0.1 });
      }, 10);
      return { taskId: 't_api', cached: false };
    },
  });
}

const body = { lat: 25.88, lng: 99.15, place: { province: '云南省', city: '大理州', county: '云龙县', village: '诺邓村' }, direction: '综合沿革' as const };

async function readSse(resp: Response): Promise<string[]> {
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = block.match(/^event: (.+)$/m)?.[1];
      if (ev) events.push(ev);
    }
  }
  return events;
}

describe('POST /api/research', () => {
  it('非法参数 → 400 invalid_params', async () => {
    const resp = await POST(new Request('http://x/api/research', { method: 'POST', body: JSON.stringify({ lat: 999, lng: 0, place: { province: 'a', county: 'b' }, direction: '综合沿革' }), headers: { 'content-type': 'application/json' } }));
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: { code: 'invalid_params' } });
  });
  it('正常创建 → SSE 依次 task_created/content/done,任务经 getRepo 落库', async () => {
    useFakeRunner();
    const resp = await POST(new Request('http://x/api/research', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
    expect(resp.headers.get('content-type')).toContain('text/event-stream');
    const events = await readSse(resp);
    expect(events[0]).toBe('task_created');
    expect(events).toContain('content');
    expect(events[events.length - 1]).toBe('done');
    expect(getRepo().getTask('t_api')!.status).toBe('completed');
  });
});

describe('GET /api/research/:id', () => {
  it('存在 → 200 全量(timeline/scarcity);不存在 → 404 not_found', async () => {
    seedRunningTask();
    const ok = await getTaskRoute(new Request('http://x'), { params: Promise.resolve({ id: 't_api' }) });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.task.id).toBe('t_api');
    expect(j.task.timeline).toEqual([]);
    expect(j.task.scarcity).toBe(false);
    const miss = await getTaskRoute(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(miss.status).toBe(404);
    expect(await miss.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('GET /api/research/:id/poll', () => {
  it('运行中 → done:false + continuePolling:true + intervalMs 3000', async () => {
    seedRunningTask();
    const rj = await (await pollRoute(new Request('http://x'), { params: Promise.resolve({ id: 't_api' }) })).json();
    expect(rj.done).toBe(false);
    expect(rj.continuePolling).toBe(true);
    expect(rj.intervalMs).toBe(3000);
    expect(rj.status).toBe('searching');
  });
  it('终态 → done:true + report 全量带回', async () => {
    seedRunningTask();
    repo.updateTask('t_api', { status: 'completed', report_md: '# 报告' });
    const rj = await (await pollRoute(new Request('http://x'), { params: Promise.resolve({ id: 't_api' }) })).json();
    expect(rj.done).toBe(true);
    expect(rj.continuePolling).toBe(false);
    expect(rj.report).toBe('# 报告');
  });
  it('不存在 → 404 not_found', async () => {
    const resp = await pollRoute(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(resp.status).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/api.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/db/client.ts` 追加测试注入口:
```ts
export function __setDbForTests(db: Database.Database): void { _db = db; migrate(db); }
```

`src/server/db/repo.ts` 文件末尾追加(`_repo` 单例缓存的重置,配合上面的 db 注入):
```ts
export function __resetRepoForTests(): void { _repo = undefined; }
```

`src/app/api/research/route.ts`:
```ts
import { z } from 'zod';
import { DIRECTIONS } from '@/lib/types';
import { getRunner } from '@/server/orchestrator/runner';
import { getRepo } from '@/server/db/repo';
import { bus } from '@/server/orchestrator/events';

const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  place: z.object({
    province: z.string().min(1),
    city: z.string().nullish(),
    county: z.string().min(1),
    village: z.string().nullish(),
  }),
  direction: z.enum(DIRECTIONS),
  extra: z.string().max(200).optional(),
});

const TERMINAL = new Set(['completed', 'scarce', 'failed']);

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: { code: 'invalid_params', message: parsed.error.issues[0]?.message ?? '参数错误' } }, { status: 400 });
  }
  const repo = getRepo();
  const { taskId, cached } = await getRunner().start(parsed.data as never);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        try { controller.close(); } catch { /* already closed */ }
      };
      const task = () => repo.getTask(taskId)!;
      send('task_created', { taskId, place: JSON.parse(task().place_json), cached });
      if (cached) {
        send('content', { delta: task().report_md });
        send('sources', { items: repo.listSources(taskId, 'kept').map((s) => ({ idx: s.idx, title: s.title, url: s.url, site: '', date: s.published_at })) });
        send('done', { taskId, status: task().status, elapsedMs: 0, sourcesKept: 0, scarcity: task().status === 'scarce', cached: true });
        close();
        return;
      }
      const unsub = bus.subscribe(taskId, (e) => {
        if (closed) return;
        send(e.event, e.data);
        if (e.event === 'done' || e.event === 'error') { unsub(); close(); }
      });
      const hb = setInterval(() => { if (!closed) { try { controller.enqueue(enc.encode(': ping\n\n')); } catch { /* noop */ } } }, 15_000);
      req.signal.addEventListener('abort', () => { unsub(); close(); });
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

export const runtime = 'nodejs';
```

`src/app/api/research/[id]/route.ts`:
```ts
import { getRepo } from '@/server/db/repo';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const repo = getRepo();
  const t = repo.getTask(id);
  if (!t) return Response.json({ error: { code: 'not_found', message: '任务不存在' } }, { status: 404 });
  const sources = repo.listSources(id).filter((s) => s.stage === 'kept' || s.stage === 'cited' || s.stage === 'fetched');
  return Response.json({
    task: {
      ...t,
      plan: t.plan_json ? JSON.parse(t.plan_json) : null,
      timeline: JSON.parse(t.timeline_json || '[]'),
      scarcity: t.status === 'scarce',
    },
    sources,
  });
}

export const runtime = 'nodejs';
```

`src/app/api/research/[id]/poll/route.ts`:
```ts
import { getRepo } from '@/server/db/repo';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const repo = getRepo();
  const t = repo.getTask(id);
  if (!t) return Response.json({ error: { code: 'not_found', message: '任务不存在' } }, { status: 404 });
  const timeline = JSON.parse(t.timeline_json || '[]') as Array<{ round?: number }>;
  const done = ['completed', 'scarce', 'failed'].includes(t.status);
  const sources = repo.listSources(id).filter((s) => s.stage === 'kept' || s.stage === 'cited');
  const lastRound = [...timeline].reverse().find((e) => e.round != null)?.round ?? 0;
  return Response.json({
    taskId: id,
    status: t.status,
    round: lastRound,
    timeline,
    sourcesKept: sources.length,
    partialChars: (t.report_md ?? '').length,
    done,
    continuePolling: !done,
    intervalMs: 3000,
    report: done ? t.report_md : null,
    sources: done ? sources.map((s) => ({ idx: s.idx, title: s.title, url: s.url })) : null,
    error: t.status === 'failed' ? { code: t.error_code, message: t.error_msg } : null,
  });
}

export const runtime = 'nodejs';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/api.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: 全量回归 + 手工冒烟**

Run: `npm test`
Expected: 全部 PASS

Run: `npm run dev` 后:
```bash
curl -s -N -X POST localhost:3000/api/research -H 'content-type: application/json' \
  -d '{"lat":25.88,"lng":99.15,"place":{"province":"云南省","city":"大理州","county":"云龙县","village":"诺邓村"},"direction":"综合沿革"}' | head -20
```
Expected: 无 key 时也应看到 `event: task_created` 与 `event: error`(llm_all_failed 或 bocha 缺 key 的失败路径);配了 key 则看到 progress/search_hit 流(然后停掉 dev)

- [ ] **Step 6: Commit**

```bash
git add src/app/api src/server/db/client.ts tests/api.test.ts
git commit -m "feat: 研究 API(POST SSE 流式 + GET 恢复 + GET 短轮询)"
```

---

### Task 12: M0 跑分脚本与 D3 地点集

**Files:**
- Create: `scripts/run-m0.ts`, `scripts/run-m0-helpers.ts`, `scripts/locations.json`
- Test: `tests/run-m0.test.ts`

**Interfaces:**
- Consumes: `POST /api/research`(HTTP,localhost)
- Produces: `parseSseBlock(block: string) → { event; data } | null`;`summarize(rows) → string`(CSV 行);`scripts/locations.json`(10 个 D3 地点,字段 `{ name, slug, lat, lng, place, direction }`);脚本输出 `reports/<timestamp>/<slug>.md` 与 `reports/<timestamp>/summary.csv`

- [ ] **Step 1: 写失败测试**

`tests/run-m0.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseSseBlock, summarize } from '../scripts/run-m0-helpers';

describe('parseSseBlock', () => {
  it('解析 event + JSON data', () => {
    expect(parseSseBlock('event: done\ndata: {"status":"completed"}')).toEqual({ event: 'done', data: { status: 'completed' } });
  });
  it('注释块与残块返回 null', () => {
    expect(parseSseBlock(': ping')).toBeNull();
    expect(parseSseBlock('data: 不是json')).toBeNull();
  });
});

describe('summarize', () => {
  it('输出 CSV 表头与行', () => {
    const csv = summarize([{ name: '诺邓', slug: 'nuodeng', status: 'completed', sourcesKept: 9, yuan: 0.18, elapsedMs: 145000 }]);
    expect(csv).toBe('name,slug,status,sourcesKept,yuan,elapsedMs\n诺邓,nuodeng,completed,9,0.18,145000');
  });
});
```

(`parseSseBlock`/`summarize` 是纯函数,放 `scripts/run-m0-helpers.ts` 供测试与脚本共用;`run-m0.ts` 由 tsx 直接跑。)

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/run-m0.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`scripts/run-m0-helpers.ts`:
```ts
export function parseSseBlock(block: string): { event: string; data: any } | null {
  const event = block.match(/^event: (.+)$/m)?.[1];
  const dataRaw = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !dataRaw) return null;
  try { return { event, data: JSON.parse(dataRaw) }; } catch { return null; }
}

export interface SummaryRow { name: string; slug: string; status: string; sourcesKept: number; yuan: number; elapsedMs: number }

export function summarize(rows: SummaryRow[]): string {
  const head = 'name,slug,status,sourcesKept,yuan,elapsedMs';
  return [head, ...rows.map((r) => `${r.name},${r.slug},${r.status},${r.sourcesKept},${r.yuan},${r.elapsedMs}`)].join('\n');
}
```

`scripts/run-m0.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import locations from './locations.json';
import { parseSseBlock, summarize, type SummaryRow } from './run-m0-helpers';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve('reports', new Date().toISOString().replace(/[:.]/g, '-'));

async function runOne(loc: (typeof locations)[number]): Promise<SummaryRow> {
  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lat: loc.lat, lng: loc.lng, place: loc.place, direction: loc.direction }),
  });
  let md = '';
  let status = 'unknown';
  let sourcesKept = 0;
  let yuan = 0;
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const parsed = parseSseBlock(buf.slice(0, i));
      buf = buf.slice(i + 2);
      if (!parsed) continue;
      if (parsed.event === 'progress' || parsed.event === 'search_hit') console.log(`  [${loc.slug}] ${parsed.event}: ${String(parsed.data.note ?? parsed.data.query ?? '')}`);
      if (parsed.event === 'content') md += parsed.data.delta ?? '';
      if (parsed.event === 'done') { status = parsed.data.status; sourcesKept = parsed.data.sourcesKept ?? 0; yuan = parsed.data.yuan ?? 0; }
      if (parsed.event === 'error') status = `failed:${parsed.data.code}`;
    }
  }
  writeFileSync(path.join(OUT, `${loc.slug}.md`), `# ${loc.name}\n\n${md}\n`);
  return { name: loc.name, slug: loc.slug, status, sourcesKept, yuan, elapsedMs: Date.now() - t0 };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows: SummaryRow[] = [];
  for (const loc of locations) {
    console.log(`▶ ${loc.name}(${loc.direction})`);
    try { rows.push(await runOne(loc)); }
    catch (e) { console.error(`✗ ${loc.name}: ${e}`); rows.push({ name: loc.name, slug: loc.slug, status: 'error', sourcesKept: 0, yuan: 0, elapsedMs: 0 }); }
  }
  writeFileSync(path.join(OUT, 'summary.csv'), summarize(rows));
  console.log('\n=== M0 汇总 ===');
  console.table(rows);
  console.log(`报告目录: ${OUT}`);
}

void main();
```

`scripts/locations.json`(D3 梯度;坐标为概略值,正式跑分前以地图核实为准;#10 预期触发 scarce):
```json
[
  { "name": "西安", "slug": "xian", "lat": 34.26, "lng": 108.94, "place": { "province": "陕西省", "city": "西安市", "county": "西安市" }, "direction": "综合沿革" },
  { "name": "敦煌", "slug": "dunhuang", "lat": 40.14, "lng": 94.66, "place": { "province": "甘肃省", "city": "酒泉市", "county": "敦煌市" }, "direction": "综合沿革" },
  { "name": "平遥古城", "slug": "pingyao", "lat": 37.20, "lng": 112.18, "place": { "province": "山西省", "city": "晋中市", "county": "平遥县" }, "direction": "古建筑文物" },
  { "name": "诺邓村", "slug": "nuodeng", "lat": 25.88, "lng": 99.15, "place": { "province": "云南省", "city": "大理州", "county": "云龙县", "village": "诺邓村" }, "direction": "综合沿革" },
  { "name": "碛口镇", "slug": "qikou", "lat": 37.66, "lng": 110.72, "place": { "province": "山西省", "city": "吕梁市", "county": "临县", "village": "碛口镇" }, "direction": "经济商贸" },
  { "name": "呈坎村", "slug": "chengkan", "lat": 29.92, "lng": 118.01, "place": { "province": "安徽省", "city": "黄山市", "county": "徽州区", "village": "呈坎村" }, "direction": "古建筑文物" },
  { "name": "上甘棠村", "slug": "shanggantang", "lat": 25.06, "lng": 111.34, "place": { "province": "湖南省", "city": "永州市", "county": "江永县", "village": "上甘棠村" }, "direction": "综合沿革" },
  { "name": "独克宗古城", "slug": "dukeong", "lat": 27.83, "lng": 99.70, "place": { "province": "云南省", "city": "迪庆州", "county": "香格里拉市", "village": "独克宗古城" }, "direction": "民族风俗" },
  { "name": "埭美古村", "slug": "daimei", "lat": 24.43, "lng": 117.85, "place": { "province": "福建省", "city": "漳州市", "county": "龙海区", "village": "埭美村" }, "direction": "古建筑文物" },
  { "name": "川西无名谷地", "slug": "wildcard", "lat": 31.12, "lng": 102.73, "place": { "province": "四川省", "city": "阿坝州", "county": "马尔康市" }, "direction": "综合沿革" }
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/run-m0.test.ts`
Expected: PASS(全部)

- [ ] **Step 5: 全量回归 + 类型检查**

Run: `npm test && npx tsc --noEmit`
Expected: 全部 PASS、无类型错误

- [ ] **Step 6: Commit**

```bash
git add scripts tests/run-m0.test.ts
git commit -m "feat: M0 跑分脚本(SSE 客户端)+ D3 十地点集"
```

---

## 收尾(全部任务完成后)

- `npm run build` 通过(standalone 产物生成)
- 更新 `docs/PREP.md`:D1 下追加"M0 代码已实现,待配 key 跑 D3"
- 提醒用户:三把 key(PREP 1.1/1.1b/1.2)到手并填入 `.env` 后,`npm run dev` + `npm run m0` 即可出第一批判盲评报告
