// Route-level loading state for the heavier Quality page. Reuses the shared
// skeleton so the placeholder stays consistent with the rest of the dashboard.

import { DashboardSkeleton } from "../components/dashboard-skeleton"

export default function Loading() {
  return <DashboardSkeleton />
}
