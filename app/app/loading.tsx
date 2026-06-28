// Root route loading UI. Shown instantly on navigation while a force-dynamic
// page awaits its Snowflake queries, so users never see a blank screen. Covers
// every route by default; heavier routes also have their own loading.tsx.

import { DashboardSkeleton } from "./components/dashboard-skeleton"

export default function Loading() {
  return <DashboardSkeleton />
}
