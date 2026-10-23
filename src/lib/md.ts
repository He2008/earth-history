// 受控 markdown 子集渲染(报告由本系统生成,但 LLM 输出按不可信处理:先全量转义)
// 支持:h2/h3、段落、加粗、blockquote、有序列表、[文本](https?链接)、引用编号上标 [n]
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// 链接先抽出为占位符,避免其方括号被引用编号/列表规则误伤
function extractLinks(text: string): { text: string; links: string[] } {
  const links: string[] = [];
  const out = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) => {
    links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return `\x00${links.length - 1}\x00`;
  });
  return { text: out, links };
}

function inline(text: string): string {
  const { text: withPlaceholders, links } = extractLinks(text);
  return withPlaceholders
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\d)\[(\d{1,3})\](?!\d)/g, '<sup class="cite" data-idx="$1">[$1]</sup>')
    .replace(/\x00(\d+)\x00/g, (_m, i: string) => links[Number(i)] ?? '');
}

export function renderReport(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const out: string[] = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { out.push('</ol>'); listOpen = false; } };
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) { out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (/^###\s+/.test(line)) { flushParagraph(); closeList(); out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); continue; }
    if (/^##\s+/.test(line)) { flushParagraph(); closeList(); out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); continue; }
    if (/^&gt;\s?/.test(line)) { flushParagraph(); closeList(); out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ''))}</blockquote>`); continue; }
    const li = line.match(/^(\d{1,3})\.\s+(.*)$/);
    if (li) {
      flushParagraph();
      if (!listOpen) { out.push('<ol>'); listOpen = true; }
      out.push(`<li value="${Number(li[1])}">${inline(li[2])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return out.join('\n');
}
