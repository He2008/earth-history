import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRepo } from '@/server/db/repo';
import { ReportView } from '@/components/report-view';
import { AiBadge } from '@/components/ai-badge';

export const dynamic = 'force-dynamic';

// F7 公开只读分享:凭 token 直读 DB,不暴露任务接口
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = getRepo().getTaskByShareToken(token);
  if (!t || !t.share_token) notFound();

  return (
    <div className="shell shell-wide">
      <header className="masthead">
        <h1 className="wordmark">史地</h1>
        <Link className="wordmark-sub" href="/">我也要问一个地方</Link>
      </header>

      <main id="main-content">
        <p className="section-label">{t.place_name} · {t.direction}</p>
        <ReportView reportMd={t.report_md} scarcity={t.status === 'scarce'} meta={{ createdAt: t.created_at }} />
      </main>

      <footer className="site-foot">
        <AiBadge />
        <span className="mono">史地 · 分享</span>
      </footer>
    </div>
  );
}
