import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
export function binary(name: "ffmpeg" | "ffprobe"): string {
  const local = path.join(
    path.dirname(process.execPath),
    "tools",
    `${name}.exe`,
  );
  return existsSync(local) ? local : name;
}
export function run(
  name: "ffmpeg" | "ffprobe",
  args: string[],
  options: {
    cwd?: string;
    signal?: AbortSignal;
    timeout?: number;
    onStdout?: (chunk: Buffer) => void;
  } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(name), args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const chunks: Buffer[] = [];
    let size = 0,
      stderr = "",
      failure: Error | undefined;
    const abort = () => {
      failure = new Error("Operation cancelled.");
      child.kill();
    };
    const timer = setTimeout(() => {
      failure = new Error(`${name} timed out.`);
      child.kill();
    }, options.timeout ?? 120000);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => {
      if (options.onStdout) {
        try {
          options.onStdout(chunk);
        } catch (error) {
          failure = error as Error;
          child.kill();
        }
      } else {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) {
          failure = new Error("Process output exceeded limit.");
          child.kill();
        } else chunks.push(chunk);
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-32768);
    });
    child.on("error", (error) => {
      failure = new Error(
        `Cannot start ${name}: ${error.message}. Install FFmpeg and FFprobe on PATH or in tools beside the app.`,
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (failure || code !== 0)
        reject(
          failure ??
            new Error(`${name} failed (${code}): ${stderr.slice(-5000)}`),
        );
      else resolve(Buffer.concat(chunks));
    });
  });
}
