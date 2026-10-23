import { htmlToText } from './readability';

export interface FetchedPage { url: string; title: string; text: string; chars: number; ok: boolean; reason?: string }
export interface Fetcher { fetch(url: string, signal?: AbortSignal): Promise<FetchedPage> }
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const UA = 'ShidiBot/0.1 (+https://localhost; research use; respects robots.txt)';

export class RobotsGuard {
  private cache = new Map<string, { rules: string[]; at: number }>();
  constructor(private fetchImpl: FetchImpl = globalThis.fetch as FetchImpl) {}
  async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const hit = this.cache.get(u.hostname);
    let rules: string[];
    if (hit && Date.now() - hit.at < 30 * 60_000) rules = hit.rules;
    else {
      try {
        const resp = await this.fetchImpl(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA } });
        rules = resp.ok ? parseDisallow(await resp.text()) : [];
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

export function createFetcher(robots: RobotsGuard, fetchImpl: FetchImpl = globalThis.fetch as FetchImpl): Fetcher {
  return {
    async fetch(url, signal) {
      try {
        if (!(await robots.allowed(url))) return { url, title: '', text: '', chars: 0, ok: false, reason: 'robots' };
        const resp = await fetchImpl(url, {
          signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(15_000)]),
          headers: { 'user-agent': UA },
        });
        if (!resp.ok) return { url, title: '', text: '', chars: 0, ok: false, reason: `http_${resp.status}` };
        const ct = resp.headers.get('content-type') ?? '';
        if (!ct.includes('html')) return { url, title: '', text: '', chars: 0, ok: false, reason: 'not_html' };
        const { title, text } = htmlToText(await resp.text());
        return { url, title, text, chars: text.length, ok: true };
      } catch {
        return { url, title: '', text: '', chars: 0, ok: false, reason: 'error' };
      }
    },
  };
}
