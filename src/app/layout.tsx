import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { BottomNav, SideNav } from "@/components/nav";
import { ToastProvider } from "@/components/client";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "مساعد الدليفري",
  description: "مراقبة الحملات الإعلانية، ردود احترافية على الرسائل، ومحتوى للسوشل ميديا لشركات التوصيل في العراق.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body className="font-sans">
        <ToastProvider>
          <div className="min-h-screen md:flex">
            <SideNav />
            <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8">
              <div className="mx-auto max-w-6xl">{children}</div>
            </main>
          </div>
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  );
}
