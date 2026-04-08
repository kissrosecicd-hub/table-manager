import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["cyrillic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Table Manager",
  description: "Управление таблицами, колонками и записями",
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${firaSans.variable} ${firaCode.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('tm-theme');
              if (theme) document.documentElement.setAttribute('data-theme', theme);
            } catch(e) {}
          })();
        ` }} />
      </head>
      <body className="min-h-screen bg-[var(--color-bg-marketing)]">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
