// Shared loading skeleton for the dashboard. Mirrors the real page layout
// (header block + a row of 4 KPI tiles + a large table) so navigation shows an
// instant, layout-stable placeholder while the force-dynamic server component
// awaits its Snowflake queries.
//
// Server-safe (no "use client"): used by the root app/app/loading.tsx and the
// route-level loading.tsx files for the heavier pages.

import Box from "@mui/material/Box"
import Card from "@mui/material/Card"
import CardContent from "@mui/material/CardContent"
import Grid from "@mui/material/Grid"
import Skeleton from "@mui/material/Skeleton"
import Stack from "@mui/material/Stack"

export function DashboardSkeleton() {
  return (
    <Box>
      {/* Header: title + subtitle on the left, filter controls on the right */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", mb: 3 }}
      >
        <Box>
          <Skeleton variant="text" width={260} height={44} />
          <Skeleton variant="text" width={320} height={22} />
        </Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Skeleton variant="rounded" width={160} height={40} />
          <Skeleton variant="rounded" width={140} height={40} />
        </Stack>
      </Stack>

      {/* KPI row */}
      <Grid container spacing={3} sx={{ mb: 1 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card>
              <CardContent>
                <Skeleton variant="text" width="50%" height={20} />
                <Skeleton variant="text" width="70%" height={40} />
                <Skeleton variant="rounded" width="100%" height={48} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Main table / chart area */}
      <Box sx={{ mt: 3 }}>
        <Card>
          <CardContent>
            <Skeleton variant="text" width={200} height={28} />
            <Skeleton variant="text" width={300} height={20} sx={{ mb: 2 }} />
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" width="100%" height={40} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}
