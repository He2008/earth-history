import { config } from '@/lib/config';
import { openAiCompatibleLlm } from './openai-compat';

// 备用 LLM:智谱 GLM(OpenAI 兼容端点 /chat/completions,PRD 已定)。
// 沿用 createQwen 名称与 'qwen' 提供方名,调用点不变;密钥与模型取 ZHIPU_API_KEY / LLM_BACKUP_MODEL。
export const QWEN_BASE = 'https://open.bigmodel.cn/api/paas/v4';

export function createQwen(getKey: () => string = () => config.ZHIPU_API_KEY, getModel: () => string = () => config.LLM_BACKUP_MODEL) {
  return openAiCompatibleLlm('qwen', QWEN_BASE, getKey, getModel);
}
