import { LlmAllFailedError, type LlmCall, type LlmProvider, type LlmRequest, type LlmUsage } from './types';

export { LlmAllFailedError }; // brief 修复:测试从 chain 导入该错误类,需再导出

export function createLlmChain(providers: LlmProvider[]): LlmProvider {
  const fails = new Map<string, number>();
  const blockedUntil = new Map<string, number>();
  return {
    name: 'llm-chain',
    chatStream(req: LlmRequest): LlmCall {
      let usageRes!: (u: LlmUsage) => void;
      let usageRej!: (e: unknown) => void;
      const usage = new Promise<LlmUsage>((res, rej) => { usageRes = res; usageRej = rej; });
      usage.catch(() => {}); // brief 修复:仅消费 stream 未 await usage 时避免 unhandled rejection(await 仍会收到拒绝)
      const stream = (async function* () {
        const tried: string[] = [];
        for (const p of providers) {
          if ((blockedUntil.get(p.name) ?? 0) > Date.now()) continue;
          for (let attempt = 0; attempt < 2; attempt++) {
            const call = p.chatStream(req);
            let produced = false;
            let ok = false;
            try {
              for await (const c of call.stream) { produced = true; yield c; }
              ok = true;
            } catch (e) {
              if (produced) { tried.push(`${p.name}:partial`); throw e; }
              tried.push(`${p.name}#${attempt}`);
            }
            if (ok) {
              call.usage.then(usageRes, usageRej);
              fails.set(p.name, 0);
              return;
            }
            const n = (fails.get(p.name) ?? 0) + 1;
            fails.set(p.name, n);
            if (n >= 3) blockedUntil.set(p.name, Date.now() + 5 * 60_000);
          }
        }
        const err = new LlmAllFailedError(tried);
        usageRej(err);
        throw err;
      })();
      return { stream, usage };
    },
  };
}
