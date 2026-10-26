// URL 归一化:去重键的基础。百科系移动域/繁简变体/追踪参数/百分号编码大小写/词条 ID 段
// 都必须折叠成同一键,否则同一词条以多副面孔进来源列表(浆洗街、峨眉山两任务实测迭代)。
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'spm', 'from', 'share_token', 'scene', 'bst', 'svcp_stk', 'chksm', 'fr', 'srcid',
  'frommodule', 'lemmafrom', 'lemmaidfrom', 'structureid', 'structureclickid', 'structureitemid',
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
    // 百科词条路径折叠:/item/名/4278752 → /item/名(带 ID 与不带 ID、各处入口是同一词条)
    if (u.hostname === 'baike.baidu.com') u.pathname = u.pathname.replace(/^(\/item\/[^/]+)\/\d+/, '$1');
    // 百分号编码统一大写(%e5 与 %E5 是同一路径,不同引擎编码习惯不同)
    u.pathname = u.pathname.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
    if (u.search) u.search = u.search.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return raw; // 畸形 URL 原样返回,不让单条脏数据毁掉整轮检索
  }
}
