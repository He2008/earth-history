import { config } from '@/lib/config';
import { HomeClient } from '@/components/home-client';

// 首页必须动态渲染:读取运行时 env 注入天地图 key。若静态预渲染,构建环境没有 .env,
// key 会被烤成空值 —— 线上地图整个消失(2026-10-27 线上实锤;与 share 页同口径)
export const dynamic = 'force-dynamic';

// 服务端只做一件事:把浏览器端瓦片 key 注入客户端(该 key 本就随每个瓦片请求公开)
export default function Home() {
  return <HomeClient tdtKey={config.TIANDITU_KEY_BROWSER} />;
}
