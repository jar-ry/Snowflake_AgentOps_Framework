import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "./components/core/theme-provider"
import { DashboardShell } from "./components/layout/dashboard-shell"
import { getEnvironments } from "@/lib/environments"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "AgentOps Monitoring",
  description: "Snowflake Agent & Semantic View monitoring dashboard",
  icons: { icon: "/icon.svg" },
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const envOptions = await getEnvironments()
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <DashboardShell envOptions={envOptions}>{children}</DashboardShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
