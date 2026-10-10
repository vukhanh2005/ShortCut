import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
export async function mediaResponse(
  file: string,
  request: Request,
): Promise<Response> {
  const info = await stat(file);
  const types: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const headers = new Headers({
    "Content-Type":
      types[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  let start = 0,
    stop = info.size - 1;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      headers.set("Content-Range", `bytes */${info.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) stop = Math.min(stop, Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(stop) ||
      start > stop ||
      start >= info.size
    ) {
      headers.set("Content-Range", `bytes */${info.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${stop}/${info.size}`);
  }
  headers.set("Content-Length", String(Math.max(0, stop - start + 1)));
  if (request.method === "HEAD" || !info.size)
    return new Response(null, { status: range ? 206 : 200, headers });
  const stream = createReadStream(file, { start, end: stop });
  const abort = () => stream.destroy();
  request.signal.addEventListener("abort", abort, { once: true });
  stream.on("close", () => request.signal.removeEventListener("abort", abort));
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}
