import { config } from '@/lib/config';
import { HomeClient } from '@/components/home-client';

// 服务端只做一件事:把浏览器端瓦片 key 注入客户端(该 key 本就随每个瓦片请求公开)
export default function Home() {
  return <HomeClient tdtKey={config.TIANDITU_KEY_BROWSER} />;
}
