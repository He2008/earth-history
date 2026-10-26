import { describe, it, expect, vi, beforeEach } from 'vitest';
import { llmLocate } from '@/server/geocode/llm-fallback';
import type { LlmProvider, LlmCall } from '@/server/providers/llm/types';

function fakeLlm(text: string): LlmProvider {
  return {
    name: 'deepseek',
    chatStream(): LlmCall {
      return {
        usage: Promise.resolve({ promptTokens: 50, completionTokens: 30 }),
        stream: (async function* () { yield { delta: text }; })(),
      };
    },
  };
}

describe('llmLocate(境外/海域粗定位,F8 兜底)', () => {
  it('陆地:解析国家/一级行政区中英文名', async () => {
    const r = await llmLocate(fakeLlm('```json\n{"ocean":false,"country":"美国","region":"堪萨斯州","region_en":"Kansas"}\n```'), 38.5, -98.5);
    expect(r).toEqual({ ocean: false, country: '美国', region: '堪萨斯州', regionEn: 'Kansas' });
  });
  it('海洋:ocean=true,其余为 null', async () => {
    const r = await llmLocate(fakeLlm('{"ocean":true,"country":null,"region":null,"region_en":null}'), 0, -140);
    expect(r.ocean).toBe(true);
    expect(r.country).toBeNull();
  });
  it('非 JSON 输出抛错(交由上层归 geocode_failed)', async () => {
    await expect(llmLocate(fakeLlm('我无法判断'), 1, 1)).rejects.toThrow();
  });
  it('提示词含坐标与输出契约,禁思考', async () => {
    const chatStream = vi.fn((_req: { messages: { content: string }[]; thinking?: string }) => ({
      usage: Promise.resolve({ promptTokens: 50, completionTokens: 30 }),
      stream: (async function* () { yield { delta: '{"ocean":true,"country":null,"region":null,"region_en":null}' }; })(),
    }));
    await llmLocate({ name: 'deepseek', chatStream }, 38.5, -98.5);
    const req = chatStream.mock.calls[0][0];
    expect(req.thinking).toBe('disabled');
    expect(req.messages.at(-1)!.content).toContain('38.5');
    expect(req.messages.at(-1)!.content).toContain('ocean');
  });
});
