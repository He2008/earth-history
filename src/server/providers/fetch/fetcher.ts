import { htmlToText } from './readability';

export interface FetchedPage { url: string; title: string; text: string; chars: number; ok: boolean; reason?: string }
export interface Fetcher { fetch(url: string, signal?: AbortSignal): Promise<FetchedPage> }
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const UA = 'ShidiBot/0.1 (+https://localhost; research use; respects robots.txt)';

// 单响应体字节上限:防超大页面/误标 content-type 的大文件把整页读进堆导致 OOM
// (实测:无上限时 node 进程 V8 堆耗尽崩溃,连带杀掉整批在跑任务)
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

async function readCapped(resp: Response, maxBytes: number): Promise<string> {
  if (!resp.body) return resp.text();
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.byteLength, maxBytes - bytes);
    out += dec.decode(take === value.byteLength ? value : value.subarray(0, take), { stream: true });
    bytes += take;
    if (take < value.byteLength) {
      try { await reader.cancel(); } catch { /* 已关闭 */ }
      break;
    }
  }
  return out;
}

export class RobotsGuard {
  private cache = new Map<string, { rules: string[]; at: number }>();
  constructor(
    private fetchImpl: FetchImpl = globalThis.fetch as FetchImpl,
    private timeoutMs = 5_000, // robots 是尽力而为:超时/失败一律放行,绝不能挂住抓取阶段
  ) {}
  async allowed(url: string, signal?: AbortSignal): Promise<boolean> {
    const u = new URL(url);
    const hit = this.cache.get(u.hostname);
    let rules: string[];
    if (hit && Date.now() - hit.at < 30 * 60_000) rules = hit.rules;
    else {
      try {
        const resp = await this.fetchImpl(`${u.origin}/robots.txt`, {
          signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(this.timeoutMs)]),
          headers: { 'user-agent': UA },
        });
        rules = resp.ok ? parseDisallow(await readCapped(resp, 64 * 1024)) : [];
      } catch { rules = []; }
      this.cache.set(u.hostname, { rules, at: Date.now() });
    }
    return !rules.some((prefix) => prefix === '' ? false : u.pathname.startsWith(prefix));
  }
}

function parseDisallow(txt: string): string[] {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups: Array<{ agents: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^(user-agent|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, val] = m;
    if (key.toLowerCase() === 'user-agent') {
      if (current && current.disallow.length === 0) current.agents.push(val.toLowerCase());
      else {
        current = { agents: [val.toLowerCase()], disallow: [] };
        groups.push(current);
      }
    } else if (current) {
      current.disallow.push(val);
    }
  }
  return groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.disallow);
}

export function createFetcher(
  robots: RobotsGuard,
  fetchImpl: FetchImpl = globalThis.fetch as FetchImpl,
  maxBodyBytes: number = DEFAULT_MAX_BODY_BYTES,
): Fetcher {
  return {
    async fetch(url, signal) {
      try {
        if (!(await robots.allowed(url, signal))) return { url, title: '', text: '', chars: 0, ok: false, reason: 'robots' };
        const resp = await fetchImpl(url, {
          signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(15_000)]),
          headers: { 'user-agent': UA },
        });
        if (!resp.ok) return { url, title: '', text: '', chars: 0, ok: false, reason: `http_${resp.status}` };
        const ct = resp.headers.get('content-type') ?? '';
        if (!ct.includes('html')) return { url, title: '', text: '', chars: 0, ok: false, reason: 'not_html' };
        const { title, text } = htmlToText(await readCapped(resp, maxBodyBytes));
        return { url, title, text, chars: text.length, ok: true };
      } catch {
        return { url, title: '', text: '', chars: 0, ok: false, reason: 'error' };
      }
    },
  };
}
