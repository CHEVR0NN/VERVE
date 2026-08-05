import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Member Login · Verve',
  icons: {
    icon: '/asset/logo.png',
  },
};

// Ported from public/index.html:8-14 — applied before first paint so a saved
// theme preference never flashes the wrong theme on load.
const THEME_INIT_SCRIPT = `(function () {
  var saved = localStorage.getItem('vrv_theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded via <link>, not next/font, to match public/index.html:16-17 exactly
            (same external stylesheet, same request), rather than switching to
            self-hosted fonts, which would change the network/loading behavior. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Faculty+Glyphic&family=Quicksand:wght@300..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Ported from public/js/demo-mode.js — must load before any other
            script fires a fetch(), matching the original <script> ordering. */}
        <Script src="/js/demo-mode.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
