// URL 归一化:去重键的基础。百科系移动域/繁简变体/追踪参数都必须折叠成同一键,
// 否则同一词条以 wap、PC、繁体三副面孔进来源列表(2026-10-23 浆洗街任务实测)。
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'spm', 'from', 'share_token', 'scene', 'bst', 'svcp_stk', 'chksm', 'fr', 'srcid',
]);

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    // 百科移动域 → 桌面域(同一词条)
    if (u.hostname === 'wapbaike.baidu.com') u.hostname = 'baike.baidu.com';
    if (u.hostname === 'zh.m.wikipedia.org') u.hostname = 'zh.wikipedia.org';
    // 维基繁简变体路径 /zh-tw/条目 → /wiki/条目
    u.pathname = u.pathname.replace(/^\/zh-(?:cn|tw|hk|sg|my|mo)\//i, '/wiki/');
    // 追踪参数大小写不敏感删除
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(k.toLowerCase())) u.searchParams.delete(k);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return raw; // 畸形 URL 原样返回,不让单条脏数据毁掉整轮检索
  }
}
