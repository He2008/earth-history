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
