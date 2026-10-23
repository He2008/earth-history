import { config } from '@/lib/config';
import { openAiCompatibleLlm } from './openai-compat';

export const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export function createQwen(getKey: () => string = () => config.ZHIPU_API_KEY) {
  return openAiCompatibleLlm('qwen', QWEN_BASE, getKey);
}
