import { describe, it, expect } from 'vitest';
import { loadHistory, pushHistory, removeHistory, HISTORY_KEY, HISTORY_CAP, type StorageLike } from '@/lib/history';

function memStorage(initial: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const e = (taskId: string, ts = 1) => ({ taskId, place: `地点${taskId}`, direction: '综合沿革', ts });

describe('F6 localStorage 历史', () => {
  it('空存储读出空列表,脏 JSON 容错为空', () => {
    expect(loadHistory(memStorage())).toEqual([]);
    expect(loadHistory(memStorage({ [HISTORY_KEY]: '{oops' }))).toEqual([]);
  });
  it('新研究压栈头,同 taskId 去重置顶', () => {
    const s = memStorage();
    pushHistory(s, e('a', 1));
    pushHistory(s, e('b', 2));
    expect(loadHistory(s).map((x) => x.taskId)).toEqual(['b', 'a']);
    pushHistory(s, e('a', 3));
    expect(loadHistory(s).map((x) => x.taskId)).toEqual(['a', 'b']);
    expect(loadHistory(s)[0]!.ts).toBe(3);
  });
  it(`上限 ${HISTORY_CAP} 条,超出裁尾`, () => {
    const s = memStorage();
    for (let i = 0; i < HISTORY_CAP + 5; i++) pushHistory(s, e(`t${i}`, i));
    const h = loadHistory(s);
    expect(h).toHaveLength(HISTORY_CAP);
    expect(h[0]!.taskId).toBe(`t${HISTORY_CAP + 4}`);
    expect(h.at(-1)!.taskId).toBe('t5');
  });
  it('removeHistory 删除指定项', () => {
    const s = memStorage();
    pushHistory(s, e('a'));
    pushHistory(s, e('b'));
    removeHistory(s, 'a');
    expect(loadHistory(s).map((x) => x.taskId)).toEqual(['b']);
  });
});
