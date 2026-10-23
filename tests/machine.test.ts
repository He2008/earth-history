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
