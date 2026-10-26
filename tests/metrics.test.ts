import { describe, it, expect } from 'vitest';
import { estimateMinutesSaved, formatSavedTime, formatCharsRead } from '@/lib/metrics';

// 口径参考原项目 metrics-calculator(HOURLY_RATE $200/h 那套)按中文文史场景校准:
// 找源 8 分/源 + 精读 12 分/源 + 成文 0.08 分/字——营销型估算,常量集中此处可调
describe('estimateMinutesSaved', () => {
  it('12 源 3000 字报告 ≈ 8 小时', () => {
    expect(estimateMinutesSaved({ sourcesKept: 12, reportChars: 3000 })).toBe(12 * 20 + Math.round(3000 * 0.08));
  });
  it('零源零字为 0(不显示徽章)', () => {
    expect(estimateMinutesSaved({ sourcesKept: 0, reportChars: 0 })).toBe(0);
  });
});

describe('formatSavedTime / formatCharsRead', () => {
  it('时间:<60 分显分钟,以上显小时+分', () => {
    expect(formatSavedTime(45)).toBe('45 分钟');
    expect(formatSavedTime(480)).toBe('8 小时');
    expect(formatSavedTime(290)).toBe('4 小时 50 分');
  });
  it('字数:万字与千字口径', () => {
    expect(formatCharsRead(18234)).toBe('约 1.8 万字');
    expect(formatCharsRead(5400)).toBe('约 5400 字');
  });
});
