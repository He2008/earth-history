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
    if ('updated_at' in patch) {
      db.prepare(`UPDATE research_tasks SET ${sets} WHERE id=?`)
        .run(...keys.map((k) => patch[k]), id);
    } else {
      db.prepare(`UPDATE research_tasks SET ${sets}, updated_at=? WHERE id=?`)
        .run(...keys.map((k) => patch[k]), now(), id);
    }
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
