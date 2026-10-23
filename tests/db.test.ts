import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate, __setDbForTests } from '@/server/db/client';
import { createRepo, getRepo, __resetRepoForTests } from '@/server/db/repo';
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

describe('getRepo 生命周期(重启清扫)', () => {
  it('安装即全量清扫:searching 且 updated_at 新鲜的行也标 failed/stale_task(与年龄无关)', async () => {
    const db = openDb(':memory:');
    __setDbForTests(db); // getRepo() 经 getDb() 必须落在这张测试库上,不得碰真实库
    const r = createRepo(db);
    r.createTask({ ...task, id: 't_restart' });
    r.updateTask('t_restart', { status: 'searching' }); // 非终态 + 新鲜 updated_at(旧语义 5 分钟阈值不会清它)
    await new Promise((res) => setTimeout(res, 3)); // 0 阈值条件为 updated_at < now,避开同毫秒
    __resetRepoForTests();
    getRepo(); // 模拟进程重启后首次安装
    const t = r.getTask('t_restart')!;
    expect(t.status).toBe('failed');
    expect(t.error_code).toBe('stale_task');
    __resetRepoForTests(); // 还原模块单例状态,不影响其他测试
  });
});
