"use client"

// Global error boundary. Catches errors thrown in the root layout itself
// (where a normal error.tsx cannot reach). Today the layout's data fetch
// self-catches, so this is future-proofing — but if the root layout ever throws,
// this prevents an unstyled crash page.
//
// A global-error boundary REPLACES the root layout, so it must render its own
// <html> and <body>. It never shows the raw error message — only friendly copy
// and the framework-provided `digest` as a correlation ref.

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[agentops] global error boundary:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0f19",
          color: "#e6e9ef",
        }}
      >
        <div style={{ maxWidth: 520, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#9aa3b2", lineHeight: 1.5 }}>
            The dashboard couldn&apos;t start. Please try again. If the problem persists,
            contact your administrator.
          </p>
          {error.digest ? (
            <p style={{ color: "#9aa3b2", fontSize: 12 }}>Reference: {error.digest}</p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "#635bff",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
