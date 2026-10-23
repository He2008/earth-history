import { config } from '@/lib/config';
import { openAiCompatibleLlm } from './openai-compat';

export const DEEPSEEK_BASE = 'https://api.deepseek.com';

export function createDeepSeek(getKey: () => string = () => config.DEEPSEEK_API_KEY) {
  return openAiCompatibleLlm('deepseek', DEEPSEEK_BASE, getKey, () => config.DEEPSEEK_MODEL);
}
