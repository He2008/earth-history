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
