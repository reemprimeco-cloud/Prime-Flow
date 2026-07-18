"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#ffffff",
          color: "#1a1a1a",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Prime Production Board hit a problem</h1>
          <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
            The app failed to load. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              height: 44,
              padding: "0 24px",
              borderRadius: 12,
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
