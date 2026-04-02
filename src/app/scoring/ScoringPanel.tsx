"use client";

import { useState } from "react";

interface ScoringResult {
  status: "success" | "error";
  scored?: number | null;
  timestamp?: string | null;
  message?: string;
  stdout?: string;
  stderr?: string | null;
}

export default function ScoringPanel() {
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runScoring() {
    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/scoring", { method: "POST" });
      const data: ScoringResult = await res.json();
      setResult(data);
    } catch {
      setResult({
        status: "error",
        message: "Network error — could not reach the server.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Fraud Prediction Model</h2>
        <p style={{ fontSize: "0.9rem" }}>
          Clicking <strong>Run Scoring</strong> executes the Python inference
          script (<code>jobs/run_inference.py</code>) which scores every order
          for fraud risk and writes predictions into the <code>order_predictions</code> table.
        </p>
        <button
          className="primary mt-1"
          onClick={runScoring}
          disabled={running}
        >
          {running ? "Running..." : "Run Scoring"}
        </button>
      </div>

      {/* ── Success ───────────────────────────────────── */}
      {result?.status === "success" && (
        <div
          className="card"
          style={{ background: "#dcfce7", borderColor: "#16a34a" }}
        >
          <h2>Scoring Complete</h2>
          <table>
            <tbody>
              <tr>
                <td><strong>Status</strong></td>
                <td>
                  <span className="badge green">Success</span>
                </td>
              </tr>
              <tr>
                <td><strong>Orders Scored</strong></td>
                <td>{result.scored ?? "—"}</td>
              </tr>
              <tr>
                <td><strong>Timestamp</strong></td>
                <td>{result.timestamp ?? "—"}</td>
              </tr>
            </tbody>
          </table>

          {result.stderr && (
            <details className="mt-1">
              <summary className="text-muted" style={{ cursor: "pointer" }}>
                Warnings (stderr)
              </summary>
              <pre
                style={{
                  fontSize: "0.8rem",
                  background: "#f1f5f9",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  overflowX: "auto",
                  marginTop: "0.5rem",
                }}
              >
                {result.stderr}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────── */}
      {result?.status === "error" && (
        <div
          className="card"
          style={{ background: "#fee2e2", borderColor: "#dc2626" }}
        >
          <h2>Scoring Failed</h2>
          <table>
            <tbody>
              <tr>
                <td><strong>Status</strong></td>
                <td>
                  <span className="badge red">Error</span>
                </td>
              </tr>
              <tr>
                <td><strong>Message</strong></td>
                <td>{result.message ?? "Unknown error"}</td>
              </tr>
            </tbody>
          </table>

          {result.stderr && (
            <details open className="mt-1">
              <summary className="text-muted" style={{ cursor: "pointer" }}>
                stderr output
              </summary>
              <pre
                style={{
                  fontSize: "0.8rem",
                  background: "#fef2f2",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  overflowX: "auto",
                  marginTop: "0.5rem",
                }}
              >
                {result.stderr}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
