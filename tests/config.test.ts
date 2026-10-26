import { describe, it, expect } from 'vitest';
import { loadConfig } from '@/lib/config';

describe('loadConfig', () => {
  it('空环境给默认值', () => {
    const c = loadConfig({});
    expect(c.SEARCH_MODE).toBe('deepseek');
    expect(c.SCARCITY_THRESHOLD).toBe(3);
    expect(c.REPORT_MAX_SOURCES).toBe(12);
    expect(c.FETCH_CONCURRENCY).toBe(4);
    expect(c.DB_PATH).toBe('data/shidi.db');
    expect(c.DEEPSEEK_MODEL).toBe('deepseek-flash');
    expect(c.LLM_BACKUP_MODEL).toBe('glm-4-flash');
  });
  it('SEARCH_MODE 四种取值合法,非法值抛错', () => {
    for (const m of ['deepseek', 'bocha', 'zhipu', 'ab'] as const) {
      expect(loadConfig({ SEARCH_MODE: m }).SEARCH_MODE).toBe(m);
    }
    expect(() => loadConfig({ SEARCH_MODE: 'baidu' })).toThrow();
  });
  it('数字字符串被 coerce', () => {
    expect(loadConfig({ SCARCITY_THRESHOLD: '5' }).SCARCITY_THRESHOLD).toBe(5);
  });
});
