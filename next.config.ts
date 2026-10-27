import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 固定 workspace 根为本项目目录:服务器上若父目录残留 package-lock.json,
  // Next 会把根推断成父目录,导致 standalone 产物嵌套到 .next/standalone/src/
  outputFileTracingRoot: path.resolve(),
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
