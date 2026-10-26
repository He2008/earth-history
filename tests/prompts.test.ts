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
