export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface LlmRequest {
  model?: string; messages: ChatMsg[]; // model 可选:提供方自默认(DeepSeek/智谱各取其配置)
  temperature?: number; maxTokens?: number; signal?: AbortSignal;
}
export interface LlmChunk { delta?: string }
export interface LlmUsage { promptTokens: number; completionTokens: number }
export interface LlmCall { stream: AsyncIterable<LlmChunk>; usage: Promise<LlmUsage> }
export interface LlmProvider {
  readonly name: 'deepseek' | 'qwen' | 'llm-chain';
  chatStream(req: LlmRequest): LlmCall;
}
export class LlmAllFailedError extends Error {
  constructor(public providers: string[]) { super(`所有 LLM 提供方失败: ${providers.join(',')}`); }
}
