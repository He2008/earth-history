import type { ChatMsg } from '@/server/providers/llm/types';
import type { Direction } from '@/lib/types';

export interface PromptPlace { name: string; province: string; county: string }

const PLANNING_SYSTEM = `你是资深中国历史地理研究员。根据地点与研究方向,规划深度检索的中文子问题。
要求:5-8 个;每个子问题独立、具体、可直接搜索(含朝代、事件、机构、地名等实体);互不重复;优先能被地方志、百科、学术论文、权威媒体报道回答的问题。
只输出 JSON,格式:{"subQuestions":["..."]},不要输出其他内容。`;

export function planningMessages(place: PromptPlace, direction: Direction, extra?: string): ChatMsg[] {
  return [
    { role: 'system', content: PLANNING_SYSTEM },
    { role: 'user', content: `地点:${place.name}(位于${place.province}${place.county})\n研究方向:${direction}${extra ? `\n用户补充要求:${extra}` : ''}\n\n请给出研究子问题,JSON 格式:{"subQuestions":["..."]}` },
  ];
}

const SYNTHESIS_SYSTEM = `你是中文历史写作研究员,面向文史爱好者撰写地点历史报告。
硬性规则:
1. 只允许使用给定资料中的信息,不得编造;资料未覆盖的内容直接略过。
2. 引用只能用资料编号 [n] 形式,编号必须来自给定资料列表,禁止自创编号。
3. 文风通俗但严谨,拒绝导游腔与抒情堆砌;不确定的表述用"据……记载"并紧跟引用。
4. 直接输出 markdown 正文,不要输出"来源列表"(系统自动生成)。`;

export function synthesisMessages(place: PromptPlace, direction: Direction, plan: string[], sourcePack: string, pagesPack: string): ChatMsg[] {
  return [
    { role: 'system', content: SYNTHESIS_SYSTEM },
    { role: 'user', content: `地点:${place.name}\n研究方向:${direction}\n研究子问题:\n${plan.map((q, i) => `${i + 1}. ${q}`).join('\n')}

【资料编号】(引用只准用这些编号)
${sourcePack}

【正文摘录】
${pagesPack || '(无正文,依据编号资料的摘要作答)'}

写作要求:
- 章节:## 建制沿革、## 重大事件、## 文化风俗、## 文物遗存、## 近现代变迁;资料不足的章节可合并或省略,但建制沿革必须写。
- 每节 2-4 段,全文 1200-2500 字。
- 每段至少有一处 [n] 引用支撑关键事实。` },
  ];
}

export function scarceMessages(place: PromptPlace, adminContext: string, snippets: string): ChatMsg[] {
  return [
    { role: 'system', content: `${SYNTHESIS_SYSTEM}\n本次资料极度稀缺:只写有把握的内容。` },
    { role: 'user', content: `地点:${place.name}(行政区划:${adminContext})
可用资料极少,摘要如下:
${snippets || '(几乎无可用资料)'}

只写两节:## 建制沿革(仅基于政区层级与通名常识)与 ## 自然地理(基于所属区域的地理常识)。
第一行必须输出引用块:> ⚠️ 公开资料稀缺,以下为该地行政区划与地理背景,不含未经证实的细节。
严禁编造具体年代、人名、事件。全文 400-800 字。` },
  ];
}

export function parsePlan(out: string): string[] {
  const m = out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { subQuestions?: unknown };
      if (Array.isArray(j.subQuestions)) {
        const qs = j.subQuestions.filter((q): q is string => typeof q === 'string' && q.trim().length > 1);
        if (qs.length) return qs.slice(0, 8);
      }
    } catch { /* fallthrough */ }
  }
  const lines = out
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[.、)]\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((l) => l.length > 4 && !l.startsWith('{') && !l.startsWith('```'));
  return (lines.length ? lines : ['该地历史沿革与现状']).slice(0, 8);
}
