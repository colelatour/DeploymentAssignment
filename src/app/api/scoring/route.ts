import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "jobs", "run_inference.py");
const TIMEOUT_MS = 30_000; // 30-second hard cap

export async function POST() {
  try {
    const { stdout, stderr } = await runPython();

    // Try to parse the structured JSON line the script prints
    let scored: number | null = null;
    let timestamp: string | null = null;

    for (const line of stdout.trim().split("\n").reverse()) {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.scored === "number") {
          scored = parsed.scored;
          timestamp = parsed.timestamp ?? null;
          break;
        }
        if (parsed.error) {
          return NextResponse.json(
            { status: "error", message: parsed.error, stderr },
            { status: 500 }
          );
        }
      } catch {
        // not JSON — skip
      }
    }

    return NextResponse.json({
      status: "success",
      scored,
      timestamp,
      stdout: stdout.trim(),
      stderr: stderr.trim() || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : null;

    return NextResponse.json(
      { status: "error", message, stderr },
      { status: 500 }
    );
  }
}

/** Spawn `python3 jobs/run_inference.py` and collect output. */
function runPython(): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Try python3 first, fall back to python
    const tryCommand = (cmd: string) => {
      execFile(
        cmd,
        [SCRIPT],
        {
          timeout: TIMEOUT_MS,
          maxBuffer: 2 * 1024 * 1024, // 2 MB
          cwd: process.cwd(),
        },
        (error, stdout, stderr) => {
          if (error) {
            // If python3 not found, retry with python
            if (
              cmd === "python3" &&
              error.message.includes("ENOENT")
            ) {
              tryCommand("python");
              return;
            }
            // Attach stderr to the error for the caller
            (error as Error & { stderr?: string }).stderr = stderr;
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        }
      );
    };

    tryCommand("python3");
  });
}
