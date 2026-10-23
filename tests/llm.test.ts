import { describe, it, expect } from 'vitest';
import { createLlmChain, LlmAllFailedError } from '@/server/providers/llm/chain';
import { openAiCompatibleLlm } from '@/server/providers/llm/openai-compat';
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
  it('首选产出部分后中断 → 链级 usage 立即被拒(不留 pending)', async () => {
    const partial: LlmProvider = {
      name: 'deepseek',
      chatStream() {
        return { usage: new Promise(() => {}), stream: (async function* () { yield { delta: 'a' }; throw new Error('mid-stream'); })() };
      },
    };
    const call = createLlmChain([partial]).chatStream({ messages: [] });
    let got = '';
    await expect(async () => { for await (const c of call.stream) got += c.delta ?? ''; }).rejects.toThrow('mid-stream');
    expect(got).toBe('a');
    await expect(call.usage).rejects.toThrow('mid-stream');
  });
});

describe('openai-compat usage 结算', () => {
  it('缺 key:stream 抛错且 usage 被拒绝', async () => {
    const p = openAiCompatibleLlm('deepseek', 'https://x.example', () => '', () => 'm');
    const call = p.chatStream({ messages: [] });
    await expect(async () => { for await (const _ of call.stream) { /* drain */ } }).rejects.toThrow('缺少 API key');
    await expect(call.usage).rejects.toThrow('缺少 API key');
  });
  it('HTTP 非 2xx:usage 同样被拒绝', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response('nope', { status: 503 })) as typeof fetch;
    try {
      const p = openAiCompatibleLlm('qwen', 'https://x.example', () => 'k', () => 'glm-4-flash');
      const call = p.chatStream({ messages: [] });
      await expect(async () => { for await (const _ of call.stream) { /* drain */ } }).rejects.toThrow('HTTP 503');
      await expect(call.usage).rejects.toThrow('HTTP 503');
    } finally { globalThis.fetch = orig; }
  });
  it('model 缺省取 getModel,流式拼 delta,usage 正常结算', async () => {
    const orig = globalThis.fetch;
    let gotBody = '';
    globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
      gotBody = String(init.body);
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'));
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"世界"}}],"usage":{"prompt_tokens":3,"completion_tokens":5}}\n\n'));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    try {
      const p = openAiCompatibleLlm('qwen', 'https://x.example', () => 'k', () => 'glm-4-flash');
      const call = p.chatStream({ messages: [{ role: 'user', content: 'q' }] }); // 不传 model → 提供方自默认
      let out = '';
      for await (const c of call.stream) out += c.delta ?? '';
      expect(out).toBe('你好世界');
      expect(JSON.parse(gotBody).model).toBe('glm-4-flash');
      expect(await call.usage).toEqual({ promptTokens: 3, completionTokens: 5 });
    } finally { globalThis.fetch = orig; }
  });
});
