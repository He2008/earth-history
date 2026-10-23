// F6 研究历史:localStorage 持久化,注入 StorageLike 以便 node 测试
export const HISTORY_KEY = 'shidi.history';
export const HISTORY_CAP = 30;

export interface HistoryEntry {
  taskId: string;
  place: string;
  direction: string;
  ts: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadHistory(storage: StorageLike): HistoryEntry[] {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.taskId === 'string') : [];
  } catch {
    return [];
  }
}

export function pushHistory(storage: StorageLike, entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory(storage).filter((x) => x.taskId !== entry.taskId)].slice(0, HISTORY_CAP);
  storage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function removeHistory(storage: StorageLike, taskId: string): HistoryEntry[] {
  const next = loadHistory(storage).filter((x) => x.taskId !== taskId);
  storage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
