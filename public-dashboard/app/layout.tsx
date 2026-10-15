import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hynix Market Radar | 하이닉스와 글로벌 시장",
  description: "SK하이닉스와 글로벌 시장 분석 대시보드.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
