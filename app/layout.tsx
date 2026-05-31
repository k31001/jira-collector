import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { db } from "@/lib/db/client";
import {
  dashboards as dashboardsTable,
  resolutionDashboards as resolutionDashboardsTable,
} from "@/lib/db/schema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "jira-collector",
  description: "여러 Jira 서버의 이슈를 한 테이블에서 모아보는 대시보드",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dashboards, resolutionDashboards] = await Promise.all([
    db
      .select({
        id: dashboardsTable.id,
        name: dashboardsTable.name,
        favorite: dashboardsTable.favorite,
      })
      .from(dashboardsTable),
    db
      .select({
        id: resolutionDashboardsTable.id,
        name: resolutionDashboardsTable.name,
        favorite: resolutionDashboardsTable.favorite,
      })
      .from(resolutionDashboardsTable),
  ]);

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryProvider>
            <TooltipProvider delayDuration={150}>
              <div className="flex min-h-screen">
                <Sidebar
                  dashboards={dashboards}
                  resolutionDashboards={resolutionDashboards}
                />
                <main className="flex-1 min-w-0 flex flex-col">{children}</main>
              </div>
              <CommandPalette dashboards={dashboards} />
              <Toaster richColors closeButton position="bottom-right" />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
