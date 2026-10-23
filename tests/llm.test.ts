import { describe, it, expect } from 'vitest';
import { createLlmChain, LlmAllFailedError } from '@/server/providers/llm/chain';
import type { LlmProvider, LlmRequest } from '@/server/providers/llm/types';

function fake(name: string, chunks: string[], behavior: { failFirstN?: number; usage?: { promptTokens: number; completionTokens: number } } = {}): LlmProvider {
  let calls = 0;
  return {
    name: name as LlmProvider['name'],
    chatStream(req: LlmRequest) {
      const n = calls++;
      const usage = Promise.resolve(behavior.usage ?? { promptTokens: 10, completionTokens: 20 });
      return {
        usage,
        stream: (async function* () {
          if (n < (behavior.failFirstN ?? 0)) throw new Error(`${name} fail #${n}`);
          for (const c of chunks) yield { delta: c };
        })(),
      };
    },
  };
}

describe('llm chain', () => {
  it('首选正常 → 拼接 delta,usage 可取', async () => {
    const chain = createLlmChain([fake('deepseek', ['你好', '世界'])]);
    const call = chain.chatStream({ model: 'm', messages: [{ role: 'user', content: 'q' }] });
    let out = '';
    for await (const c of call.stream) out += c.delta ?? '';
    expect(out).toBe('你好世界');
    expect(await call.usage).toEqual({ promptTokens: 10, completionTokens: 20 });
  });
  it('首选连败 → 落到备选', async () => {
    const chain = createLlmChain([fake('deepseek', [], { failFirstN: 2 }), fake('qwen', ['备选'])]);
    const call = chain.chatStream({ model: 'm', messages: [] });
    let out = '';
    for await (const c of call.stream) out += c.delta ?? '';
    expect(out).toBe('备选');
  });
  it('首选第一次失败第二次成功(同家重试 1 次)', async () => {
    const chain = createLlmChain([fake('deepseek', ['ok'], { failFirstN: 1 })]);
    const call = chain.chatStream({ model: 'm', messages: [] });
    let out = '';
    for await (const c of call.stream) out += c.delta ?? '';
    expect(out).toBe('ok');
  });
  it('全部失败 → LlmAllFailedError', async () => {
    const chain = createLlmChain([fake('deepseek', [], { failFirstN: 99 }), fake('qwen', [], { failFirstN: 99 })]);
    const call = chain.chatStream({ model: 'm', messages: [] });
    await expect(async () => { for await (const _ of call.stream) { /* drain */ } }).rejects.toThrow(LlmAllFailedError);
  });
});
