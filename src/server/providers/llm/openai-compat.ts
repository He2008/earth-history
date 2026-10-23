import { sseDataLines } from '@/lib/openai-sse';
import type { LlmCall, LlmProvider, LlmRequest, LlmUsage } from './types';

export function openAiCompatibleLlm(name: 'deepseek' | 'qwen', baseUrl: string, getKey: () => string): LlmProvider {
  return {
    name,
    chatStream(req: LlmRequest): LlmCall {
      let usageRes!: (u: LlmUsage) => void;
      let usageRej!: (e: unknown) => void;
      const usage = new Promise<LlmUsage>((res, rej) => { usageRes = res; usageRej = rej; });
      const stream = (async function* () {
        const key = getKey();
        if (!key) throw new Error(`${name}: 缺少 API key`);
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: req.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            stream: true,
            stream_options: { include_usage: true },
            ...(req.temperature != null && { temperature: req.temperature }),
            ...(req.maxTokens != null && { max_tokens: req.maxTokens }),
          }),
        });
        if (!resp.ok || !resp.body) throw new Error(`${name}: HTTP ${resp.status}`);
        let u: LlmUsage = { promptTokens: 0, completionTokens: 0 };
        try {
          for await (const data of sseDataLines(resp.body)) {
            if (data === '[DONE]') break;
            const j = JSON.parse(data);
            const d: unknown = j.choices?.[0]?.delta?.content;
            if (typeof d === 'string' && d) yield { delta: d };
            if (j.usage) u = { promptTokens: j.usage.prompt_tokens ?? 0, completionTokens: j.usage.completion_tokens ?? 0 };
          }
          usageRes(u);
        } catch (e) {
          usageRej(e);
          throw e;
        }
      })();
      return { stream, usage };
    },
  };
}
