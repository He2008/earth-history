import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '史地 · 点地问史',
  description: '在卫星地球上点一个地方,AI 检索中文史料,几分钟产出带引用的历史报告。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
