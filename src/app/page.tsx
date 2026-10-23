export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>史地 M0</h1>
      <p>编排器服务已启动。用 `npm run m0` 或 `curl -N -X POST localhost:3000/api/research` 触发研究。</p>
      <p>AI 生成内容,仅供参考。</p>
    </main>
  );
}
