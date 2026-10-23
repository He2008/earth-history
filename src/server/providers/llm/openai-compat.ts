import { sseDataLines } from '@/lib/openai-sse';
import type { LlmCall, LlmProvider, LlmRequest, LlmUsage } from './types';

export function openAiCompatibleLlm(name: 'deepseek' | 'qwen', baseUrl: string, getKey: () => string, getModel: () => string): LlmProvider {
  return {
    name,
    chatStream(req: LlmRequest): LlmCall {
      let usageRes!: (u: LlmUsage) => void;
      let usageRej!: (e: unknown) => void;
      const usage = new Promise<LlmUsage>((res, rej) => { usageRes = res; usageRej = rej; });
      usage.catch(() => {}); // 与 chain.ts 一致:仅消费 stream 未 await usage 时避免 unhandled rejection(await 仍会收到拒绝)
      const stream = (async function* () {
        try {
          const key = getKey();
          if (!key) throw new Error(`${name}: 缺少 API key`);
          const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal: req.signal,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model: req.model ?? getModel(),
              messages: req.messages,
              stream: true,
              stream_options: { include_usage: true },
              ...(req.temperature != null && { temperature: req.temperature }),
              ...(req.maxTokens != null && { max_tokens: req.maxTokens }),
              ...(req.thinking && { thinking: { type: req.thinking } }),
            }),
          });
          if (!resp.ok || !resp.body) throw new Error(`${name}: HTTP ${resp.status}`);
          let u: LlmUsage = { promptTokens: 0, completionTokens: 0 };
          for await (const data of sseDataLines(resp.body)) {
            if (data === '[DONE]') break;
            const j = JSON.parse(data);
            const d: unknown = j.choices?.[0]?.delta?.content;
            if (typeof d === 'string' && d) yield { delta: d };
            if (j.usage) u = { promptTokens: j.usage.prompt_tokens ?? 0, completionTokens: j.usage.completion_tokens ?? 0 };
          }
          usageRes(u);
        } catch (e) {
          // 早期失败(缺 key / fetch 拒绝 / HTTP 非 2xx)与 SSE 中途失败都必须结算 usage,不得留 pending
          usageRej(e);
          throw e;
        }
      })();
      return { stream, usage };
    },
  };
}
