import path from "node:path";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { _electron as electron, expect } from "@playwright/test";
import { run } from "../dist-electron/electron/process.js";
import { importAsset } from "../dist-electron/electron/media.js";
import { render } from "../dist-electron/electron/render.js";
import { saveProject } from "../dist-electron/electron/project.js";
import {
  newProject,
  newClip,
  newTrack,
  SECOND,
} from "../dist-electron/src/editor/model.js";
const root = path.resolve(`.cache/benchmark-${Date.now()}`);
await mkdir(root, { recursive: true });
const source = path.join(root, "motion.mp4");
await run("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=s=1920x1080:r=30:d=7.5",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-crf",
  "28",
  source,
]);
const project = newProject();
project.name = "One-minute 1080p benchmark";
for (let i = 0; i < 8; i++) {
  const file = path.join(root, `scene-${i}.mp4`);
  await copyFile(source, file);
  const asset = await importAsset(file, path.join(root, "cache"));
  project.mediaAssets.push(asset);
  project.tracks[1].clips.push(
    newClip(project.tracks[1].id, asset, i * 7.5 * SECOND),
  );
}
for (const [name, frequency, length] of [
  ["Voice", 440, 60],
  ["Music", 220, 60],
  ["SFX", 1200, 0.25],
]) {
  const file = path.join(root, `${name}.wav`);
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${length}`,
    file,
  ]);
  const asset = await importAsset(file, path.join(root, "cache"));
  project.mediaAssets.push(asset);
  const track = newTrack("audio", name);
  project.tracks.push(track);
  for (const at of name === "SFX" ? [5, 15, 25, 35, 45] : [0]) {
    const c = newClip(track.id, asset, at * SECOND);
    c.volume = name === "Voice" ? 1 : 0.25;
    track.clips.push(c);
  }
}
for (let i = 0; i < 10; i++) {
  const c = newClip(project.tracks[0].id, undefined, i * 6 * SECOND);
  c.text.text = `Scene ${i + 1}: Science in motion`;
  c.timelineDuration = 4 * SECOND;
  c.sourceOut = 4 * SECOND;
  project.tracks[0].clips.push(c);
}
const titles = newTrack("subtitle", "Titles");
project.tracks.unshift(titles);
for (const at of [0, 54]) {
  const c = newClip(titles.id, undefined, at * SECOND);
  c.text.text = "SHORTCUT STUDIO";
  c.transform.y = -650;
  titles.clips.push(c);
}
const file = path.join(root, "benchmark.shortcut");
await saveProject(file, project);
const profile = path.join(root, "profile");
await mkdir(profile);
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, SHORTCUT_TEST_HOME: profile, SHORTCUT_DEV: "0" },
});
const result = {
  workload:
    "8 x 1920x1080 30 FPS motion clips; 60-second 1080x1920 project; voice/music/5 SFX; 10 captions/2 titles",
  fixture: file,
  node: process.version,
  cpuExportSeconds: 0,
  projectLoadMs: 0,
  firstFrameMs: 0,
  seeksMs: [],
  electronWorkingSetMiB: 0,
  playbackFrameGapsMs: {},
};
try {
  const page = await app.firstWindow();
  await expect(page.getByText("Media engine ready")).toBeVisible({
    timeout: 30000,
  });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  const start = performance.now();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await expect(page.getByText("Saved to disk", { exact: true })).toBeVisible({
    timeout: 120000,
  });
  result.projectLoadMs = Math.round(performance.now() - start);
  await expect
    .poll(
      () =>
        page
          .locator("video:visible")
          .first()
          .evaluate((v) => v.readyState),
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(2);
  result.firstFrameMs = Math.round(performance.now() - start);
  await page.getByLabel("Timeline zoom", { exact: true }).fill("20");
  for (const at of [1, 8, 16, 30, 45]) {
    const seekStart = performance.now();
    await page.locator(".ruler").click({ position: { x: at * 20, y: 12 } });
    try {
      await expect
        .poll(
          () =>
            page
              .locator("video:visible")
              .first()
              .evaluate(
                (v, wanted) =>
                  !v.seeking &&
                  v.readyState >= 2 &&
                  Math.abs(v.currentTime - wanted) < 0.06,
                at % 7.5,
              ),
          { timeout: 15000 },
        )
        .toBe(true);
    } catch (error) {
      console.log("Seek diagnostic", {
        at,
        zoom: await page
          .getByLabel("Timeline zoom", { exact: true })
          .inputValue(),
        timecode: await page.locator(".timecode").textContent(),
        media: await page.locator("video:visible").evaluateAll((vs) =>
          vs.map((v) => ({
            currentTime: v.currentTime,
            ready: v.readyState,
            seeking: v.seeking,
            error: v.error?.message,
          })),
        ),
      });
      throw error;
    }
    result.seeksMs.push(Math.round(performance.now() - seekStart));
  }
  await page.getByRole("button", { name: "Play", exact: true }).click();
  result.playbackFrameGapsMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let prior = performance.now();
        const tick = (now) => {
          deltas.push(now - prior);
          prior = now;
          if (deltas.length < 120) requestAnimationFrame(tick);
          else {
            deltas.sort((a, b) => a - b);
            resolve({
              median: Number(deltas[60].toFixed(2)),
              p95: Number(deltas[114].toFixed(2)),
              max: Number(deltas[119].toFixed(2)),
              samples: 120,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  result.electronWorkingSetMiB = await app.evaluate(({ app }) =>
    Math.round(
      app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0) /
        1024,
    ),
  );
} finally {
  await app.close();
}
const renderStart = performance.now();
await render(project, path.join(root, "benchmark.mp4"), {
  quality: 23,
  audioBitrate: 192,
  hardware: false,
});
result.cpuExportSeconds = Number(
  ((performance.now() - renderStart) / 1000).toFixed(2),
);
await writeFile("docs/benchmark-latest.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
