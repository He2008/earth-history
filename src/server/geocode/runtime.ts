import { config } from '@/lib/config';
import { createTiandituGeocoder, type Geocoder } from './tianditu';

// 逆地理运行时单例(测试钩子放这里,Next 路由文件只准导出处理器与配置)
let _geocoder: Geocoder | null = null;

export function __setGeocodeForTests(g: Geocoder | null): void { _geocoder = g; }

export function getGeocode(): Geocoder {
  return _geocoder ??= createTiandituGeocoder(
    () => config.TIANDITU_KEY_SERVER,
    process.env.TIANDITU_ORIGIN ?? 'http://localhost:3000/',
  );
}
