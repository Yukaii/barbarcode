import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a command to completion, optionally feeding stdin. Rejects only if it can't be spawned. */
export function run(command: string, args: string[], input?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
}

/** Finds an executable on PATH (plus optional well-known locations). */
export async function findExecutable(name: string, extra: string[] = []): Promise<string | null> {
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const candidates = [...dirs.flatMap((d) => exts.map((e) => path.join(d, name + e))), ...extra];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}
