// 受控 markdown 子集渲染(报告由本系统生成,但 LLM 输出按不可信处理:先全量转义)
// 支持:h2/h3、段落、加粗、blockquote、有序列表、[文本](https?链接)、引用编号上标 [n]
// 「## 来源」小节渲染为百度百科参考资料风格:序号徽标/favicon/外链图标/站点/日期/回跳锚点
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const EXT_ICON = '<svg class="ref-ext" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M1 9L9 1M9 1H3.5M9 1v5.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GOTOP_ICON = '<svg class="ref-gotop-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 10V2.2M6 2.2L2.6 5.6M6 2.2l3.4 3.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

interface RenderState { citedIdx: Set<number> }

// 链接先抽出为占位符,避免其方括号被引用编号/列表规则误伤
function extractLinks(text: string): { text: string; links: string[] } {
  const links: string[] = [];
  const out = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) => {
    links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return `\x00${links.length - 1}\x00`;
  });
  return { text: out, links };
}

function inline(text: string, state: RenderState): string {
  const { text: withPlaceholders, links } = extractLinks(text);
  return withPlaceholders
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\d)\[(\d{1,3})\](?!\d)/g, (m, n: string) => {
      const idx = Number(n);
      const anchor = state.citedIdx.has(idx) ? '' : (state.citedIdx.add(idx), ` id="cite-${idx}"`);
      return `<sup class="cite" data-idx="${idx}"${anchor}>${m}</sup>`;
    })
    .replace(/\x00(\d+)\x00/g, (_m, i: string) => links[Number(i)] ?? '');
}

// 百科参考资料条目:`[标题](url) ．站点 [日期]` → 徽标/链接/favicon/站点/日期/回跳
function refItem(value: number, raw: string, state: RenderState): string {
  const m = raw.match(/^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*(.*)$/);
  if (!m) return `<li value="${value}">${inline(raw, state)}</li>`;
  const [, title, url, rest] = m;
  let host = '';
  try { host = new URL(url).hostname; } catch { host = ''; }
  const favicon = host
    ? `<img class="ref-favicon" src="https://icons.duckduckgo.com/ip3/${host}.ico" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  const dateMatch = rest.match(/^(.*?)\s*\[(\d{4}-\d{2}-\d{2})(?:T[^\]]*)?\]\s*$/); // 兼容历史 ISO 时区尾巴,只展示日期
  const site = (dateMatch ? dateMatch[1] : rest).trim();
  const date = dateMatch ? `<span class="ref-date">[${dateMatch[2]}]</span>` : '';
  const siteSpan = site ? `<span class="ref-site">${site}</span>` : '';
  const gotop = state.citedIdx.has(value) ? `<a class="ref-gotop" href="#cite-${value}" aria-label="回到正文引用处">${GOTOP_ICON}</a>` : '';
  return `<li value="${value}" class="ref-item"><span class="ref-index">${value}</span><div class="ref-main"><a class="ref-link" href="${url}" target="_blank" rel="noopener noreferrer">${favicon}${title}${EXT_ICON}</a>${siteSpan}${date}${gotop}</div></li>`;
}

export function renderReport(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const state: RenderState = { citedIdx: new Set() };
  const out: string[] = [];
  let listOpen = false;
  let inRefs = false; // 「## 来源」小节内
  const closeList = () => { if (listOpen) { out.push('</ol>'); listOpen = false; } };
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join('\n'), state).replace(/\n/g, '<br>')}</p>`);
    paragraph = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (/^###\s+/.test(line)) { flushParagraph(); closeList(); out.push(`<h3>${inline(line.replace(/^###\s+/, ''), state)}</h3>`); continue; }
    if (/^##\s+/.test(line)) {
      flushParagraph(); closeList();
      const text = line.replace(/^##\s+/, '');
      inRefs = text.trim() === '来源';
      out.push(`<h2>${inline(text, state)}</h2>`);
      continue;
    }
    if (/^&gt;\s?/.test(line)) { flushParagraph(); closeList(); out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ''), state)}</blockquote>`); continue; }
    const li = line.match(/^(\d{1,3})\.\s+(.*)$/);
    if (li) {
      flushParagraph();
      if (!listOpen) { out.push('<ol>'); listOpen = true; }
      const value = Number(li[1]);
      out.push(inRefs ? refItem(value, li[2], state) : `<li value="${value}">${inline(li[2], state)}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return out.join('\n');
}
