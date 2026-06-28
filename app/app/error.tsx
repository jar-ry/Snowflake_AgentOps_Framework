"use client"

// Route-level error boundary. Catches uncaught errors thrown while rendering a
// page subtree (the pages themselves catch query failures and render an inline
// message, so this is a safety net for unexpected/render-time errors).
//
// It must be a Client Component (Next.js requirement). It NEVER renders the raw
// error message — only a friendly message plus the framework-provided `digest`
// as a correlation ref. Full detail is logged server-side and to the browser
// console for debugging.

import { useEffect } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Card from "@mui/material/Card"
import CardContent from "@mui/material/CardContent"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Logged for debugging; the raw message is intentionally NOT shown in the UI.
    console.error("[agentops] route error boundary:", error)
  }, [error])

  return (
    <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
      <Card sx={{ maxWidth: 520, width: "100%" }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">Something went wrong</Typography>
            <Typography color="text.secondary" variant="body2">
              We couldn&apos;t load this page right now. Please try again. If the problem
              persists, contact your administrator.
            </Typography>
            {error.digest ? (
              <Typography color="text.secondary" variant="caption">
                Reference: {error.digest}
              </Typography>
            ) : null}
            <Box>
              <Button variant="contained" onClick={() => reset()}>
                Try again
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
