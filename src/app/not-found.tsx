import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <main className="lost" id="main-content">
        <h1>无此地</h1>
        <p>这个链接指向的地方不存在,或者已经失落。</p>
        <Link className="btn btn-primary" href="/">回首页挑一个地方</Link>
      </main>
    </div>
  );
}
