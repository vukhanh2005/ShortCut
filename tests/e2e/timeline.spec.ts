import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "node:path";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import { run } from "../../electron/process";
import { formatTime, type Project } from "../../src/editor/model";

const root = path.resolve(`.cache/timeline-fixes-${Date.now()}`);
const source = path.join(root, "two-scenes.mp4");
const sound = path.join(root, "tone.wav");
test.beforeAll(async () => {
  await mkdir(root, { recursive: true });
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=160x284:r=60:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-f",
    "lavfi",
    "-i",
    "color=blue:s=160x284:r=60:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=2",
    "-filter_complex",
    "[0:v][1:a][2:v][3:a]concat=n=2:v=1:a=1[v][a]",
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    source,
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=2",
    sound,
  ]);
});
async function launch(name: string, fps = 30, observeAudio = false) {
  const profile = path.join(root, name);
  await mkdir(profile, { recursive: true });
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, SHORTCUT_DEV: "0", SHORTCUT_TEST_HOME: profile },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow, dialog }) => {
    BrowserWindow.getAllWindows()[0].setSize(1600, 1000);
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    dialog.showMessageBoxSync = () => 1;
  });
  await expect(page.getByText("Media engine ready")).toBeVisible({
    timeout: 30000,
  });
  if (observeAudio)
    await page.evaluate(() => {
      const original = AudioContext.prototype.createGain;
      (window as any).observedGains = [];
      AudioContext.prototype.createGain = function () {
        const node = original.call(this);
        (window as any).observedGains.push(node);
        return node;
      };
    });
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("160");
  await page.getByLabel("Width", { exact: true }).press("Tab");
  await page.getByLabel("Height", { exact: true }).fill("284");
  await page.getByLabel("Height", { exact: true }).press("Tab");
  await page.getByLabel("Frame rate").selectOption(String(fps));
  await page.getByRole("button", { name: "Create project" }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, source);
  await page.getByRole("button", { name: /Import files/ }).click();
  await page.getByLabel("Add two-scenes.mp4", { exact: true }).click();
  await expect(page.locator(".clip-video")).toHaveCount(1);
  return { app, page };
}
async function save(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<Project> {
  const file = path.join(root, `${name}.shortcut`);
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to disk", { exact: true })).toBeVisible();
  return JSON.parse(await readFile(file, "utf8"));
}
test("auto-track zones, magnetic split seeking, linked overlap and populated deletion", async () => {
  const { app, page } = await launch("auto-tracks");
  try {
    const divider = (await page
      .getByRole("separator", { name: "Resize bottom panel" })
      .boundingBox())!;
    await page.mouse.move(divider.x + 500, divider.y + 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 500, divider.y - 240);
    await page.mouse.up();
    await page
      .locator(".clip-video")
      .click({ button: "right", position: { x: 30, y: 15 } });
    await page
      .getByRole("menuitem", { name: "Separate linked audio", exact: true })
      .click();
    await page.locator(".ruler").click({ position: { x: 160, y: 28 } });
    await page.keyboard.press("Control+b");
    await expect(page.locator(".clip-video")).toHaveCount(2);
    const handle = page.getByRole("slider", { name: "Timeline playhead" });
    for (const zoom of [20, 80, 240]) {
      await page.getByLabel("Timeline zoom").fill(String(zoom));
      await page.locator(".timeline-scroll").evaluate((e, zoom) => {
        e.scrollLeft = zoom === 240 ? 300 : 0;
      }, zoom);
      const ruler = (await page.locator(".ruler").boundingBox())!;
      await page.mouse.move(ruler.x + 2 * zoom + 7, ruler.y + 28);
      await page.mouse.down();
      await expect(handle).toHaveAttribute("aria-valuenow", "2000000");
      await expect(page.locator(".snap-guide")).toBeVisible();
      await page.mouse.move(ruler.x + 2 * zoom + 18, ruler.y + 28);
      await expect(page.locator(".snap-guide")).toHaveCount(0);
      await page.mouse.up();
    }
    await page.getByLabel("Timeline zoom").fill("80");
    await page.locator(".timeline-scroll").evaluate((e) => {
      e.scrollLeft = 0;
    });
    await handle.focus();
    await page.keyboard.press("n");
    await expect(page.getByTitle("Toggle snapping")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.locator(".ruler").click({ position: { x: 167, y: 28 } });
    await expect(handle).not.toHaveAttribute("aria-valuenow", "2000000");
    await handle.focus();
    await page.keyboard.press("n");
    const id = await page
      .locator(".clip-video")
      .nth(1)
      .getAttribute("data-clip-id");
    const segment = page.locator(`[data-clip-id="${id}"]`);
    let box = (await segment.boundingBox())!,
      zone = (await page.getByLabel("Create video track zone").boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x - 50, zone.y + 14, { steps: 8 });
    await expect(
      page.getByLabel("Create video track zone").locator(".drag-ghost"),
    ).toHaveCount(1);
    await expect(page.locator(".track-row")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".track-row")).toHaveCount(3);
    box = (await segment.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x - 50, zone.y + 14, { steps: 8 });
    await expect(
      page.getByLabel("Create video track zone").locator(".drag-ghost"),
    ).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator(".track-row")).toHaveCount(5);
    await expect(segment).toHaveCSS("left", "80px");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".track-row")).toHaveCount(3);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".track-row")).toHaveCount(5);
    const before = await save(app, page, "auto-tracks-before");
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false,
      });
    });
    await segment
      .locator("xpath=../..")
      .getByTitle("Delete track", { exact: true })
      .click();
    await expect(page.locator(".clip-video")).toHaveCount(1);
    await expect(page.locator(".clip-audio")).toHaveCount(2);
    const after = await save(app, page, "auto-tracks-before");
    for (const c of after.tracks.flatMap((t) => t.clips))
      expect(c.timelineStart).toBe(
        before.tracks.flatMap((t) => t.clips).find((v) => v.id === c.id)!
          .timelineStart,
      );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(2);
    const audio = page.locator(".clip-audio").last();
    await audio.scrollIntoViewIfNeeded();
    box = (await audio.boundingBox())!;
    const audioZone = page.getByLabel("Create audio track zone");
    await audioZone.scrollIntoViewIfNeeded();
    box = (await audio.boundingBox())!;
    zone = (await audioZone.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, zone.y + 14, { steps: 8 });
    await expect(audioZone.locator(".drag-ghost")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator(".track-row")).toHaveCount(6);
    await page.screenshot({ path: "test-results/timeline-engine.png" });
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await app.close();
  }
});
test("library zones reuse video/audio assets without ripple and edge scrolling cancels cleanly", async () => {
  const { app, page } = await launch("library-zones");
  try {
    const divider = (await page
      .getByRole("separator", { name: "Resize bottom panel" })
      .boundingBox())!;
    await page.mouse.move(divider.x + 500, divider.y + 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 500, divider.y - 240);
    await page.mouse.up();
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("button", { name: /Add caption at playhead/ }).click();
    await page.getByLabel("Ripple", { exact: true }).check();
    await page.getByRole("button", { name: "Media", exact: true }).click();
    const card = page
      .locator(".media-card")
      .filter({ hasText: "two-scenes.mp4" });
    for (let i = 0; i < 2; i++)
      await card.dragTo(page.getByLabel("Create video track zone"), {
        targetPosition: { x: 256, y: 14 },
      });
    await expect(page.locator(".clip-video")).toHaveCount(3);
    await expect(page.locator(".clip-subtitle")).toHaveCSS("left", "0px");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, sound);
    await page.getByRole("button", { name: /Import files/ }).click();
    await expect(
      page.getByLabel("Add tone.wav", { exact: true }),
    ).toBeVisible();
    const audioCard = page
      .locator(".media-card")
      .filter({ hasText: "tone.wav" });
    for (let i = 0; i < 2; i++)
      await audioCard.dragTo(page.getByLabel("Create audio track zone"), {
        targetPosition: { x: 256, y: 14 },
      });
    await expect(page.locator(".clip-audio")).toHaveCount(2);
    await expect(page.locator(".clip-audio .waveform path")).toHaveCount(6);
    const data = await save(app, page, "library-zones");
    const clips = data.tracks.flatMap((t) => t.clips);
    expect(new Set(clips.map((c) => c.id)).size).toBe(clips.length);
    expect(
      new Set(clips.filter((c) => c.mediaAssetId).map((c) => c.mediaAssetId))
        .size,
    ).toBe(2);
    expect(
      data.tracks
        .filter((t) => t.type === "video")
        .flatMap((t) => t.clips.map((c) => c.timelineStart))
        .sort(),
    ).toEqual([0, 1000000, 1000000]);
    const rows = data.tracks.length;
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".track-row")).toHaveCount(rows - 1);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".track-row")).toHaveCount(rows);
    await page.locator(".timeline-scroll").evaluate((e) => {
      e.scrollTop = 0;
      e.scrollLeft = 0;
    });
    const clip = page.locator(".clip-video").first();
    const box = (await clip.boundingBox())!,
      host = (await page.locator(".timeline-scroll").boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(host.x + host.width - 5, box.y + 15);
    await expect
      .poll(() =>
        page.locator(".timeline-scroll").evaluate((e) => e.scrollLeft),
      )
      .toBeGreaterThan(50);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".drag-ghost")).toHaveCount(0);
    expect((await save(app, page, "library-zones")).tracks).toEqual(
      data.tracks,
    );
    await page.getByTitle("Toggle snapping").click();
    await page.reload();
    await expect(page.getByTitle("Toggle snapping")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  } finally {
    await app.close();
  }
});
for (const fps of [30, 60])
  test(`captured scrubbing follows latest frame at ${fps} FPS with zoom and scroll`, async () => {
    const { app, page } = await launch(`scrub-${fps}`, fps);
    try {
      const handle = page.getByRole("slider", { name: "Timeline playhead" });
      const check = async (index: number) => {
        const ticks = Math.round((index * 1e6) / fps);
        await expect(handle).toHaveAttribute("aria-valuenow", String(ticks));
        await expect(page.locator(".timecode")).toContainText(
          formatTime(ticks),
        );
        await expect
          .poll(() =>
            page
              .locator("video[data-player]")
              .evaluate(
                (v: HTMLVideoElement, ticks) =>
                  !v.seeking &&
                  v.readyState >= 2 &&
                  Math.abs(v.currentTime - ticks / 1e6) < 0.005,
                ticks,
              ),
          )
          .toBe(true);
      };
      let ruler = (await page.locator(".ruler").boundingBox())!;
      await page.mouse.move(ruler.x + 80 * 0.7, ruler.y + 12);
      await page.mouse.down();
      await page.mouse.move(ruler.x + 80 * (37 / fps), ruler.y - 100, {
        steps: 10,
      });
      await check(37); // Continuous update before pointer release, outside ruler.
      await page.mouse.up();
      await check(37);
      let box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 8);
      await page.mouse.down();
      for (const x of [250, 30, 290, 10, 160, -200])
        await page.mouse.move(ruler.x + x, ruler.y - 50);
      await page.mouse.up();
      await check(0);
      await page.locator(".ruler").click({ position: { x: 80, y: 12 } });
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.mouse.move(ruler.x + 180, ruler.y + 12);
      await page.mouse.down();
      await page.mouse.move(1590, ruler.y - 100);
      await page.mouse.up();
      await expect(
        page.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      await check(4 * fps - 1);
      await page.getByLabel("Timeline zoom").fill("240");
      await page.locator(".timeline-scroll").evaluate((e) => {
        e.scrollLeft = 300;
      });
      ruler = (await page.locator(".ruler").boundingBox())!;
      await page.mouse.move(ruler.x + 240 * 2.1, ruler.y + 12);
      await page.mouse.down();
      for (const second of [3.4, 1.9, 3.1, 2.4, 2 + 7 / fps])
        await page.mouse.move(ruler.x + 240 * second, ruler.y - 70);
      await check(2 * fps + 7);
      await page.mouse.up();
      await handle.focus();
      await page.keyboard.press("ArrowRight");
      await check(2 * fps + 8);
      await expect(page.locator(".clip-video")).toHaveCount(1);
      await expect(page.locator(".clip-video")).toHaveCSS("left", "0px");
      await page.screenshot({ path: `test-results/scrub-${fps}.png` });
      await save(app, page, `scrub-${fps}`);
    } finally {
      await app.close();
    }
  });

test("mixer controls change Web Audio gain, mute video sound, persist and undo", async () => {
  const { app, page } = await launch("mixer", 30, true);
  try {
    await page.getByLabel("Clip gain (dB)").fill("-6");
    await page.getByLabel("Clip gain (dB)").press("Tab");
    await page.getByLabel("Track gain (dB)").fill("-6");
    await page.getByLabel("Track gain (dB)").press("Tab");
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).observedGains.at(-1)?.gain.value),
      )
      .toBeCloseTo(10 ** (-12 / 20), 5);
    await page.getByLabel("Mute clip", { exact: true }).check();
    await expect
      .poll(() =>
        page
          .locator("video[data-player]")
          .evaluate((v: HTMLVideoElement) => v.muted),
      )
      .toBe(true);
    await expect(page.locator("video[data-player]")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video[data-player]")
          .evaluate((v: HTMLVideoElement) => v.muted),
      )
      .toBe(false);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByLabel("Mute clip", { exact: true })).toBeChecked();
    const data = await save(app, page, "mixer");
    expect(data.tracks[1].volume).toBeCloseTo(10 ** (-6 / 20), 6);
    expect(data.tracks[1].clips[0].muted).toBe(true);
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      },
      path.join(root, "mixer.shortcut"),
    );
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(page.locator(".statusbar .spinner")).toHaveCount(0);
    await page.locator(".clip-video").click({ position: { x: 40, y: 18 } });
    await expect(page.getByLabel("Mute clip", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Track gain (dB)")).toHaveValue("-6");
  } finally {
    await app.close();
  }
});

test("split video moves vertically, overlays, rejects audio drops and preserves linked sound on reopen", async () => {
  const { app, page } = await launch("layers");
  try {
    const divider = (await page
      .getByRole("separator", { name: "Resize bottom panel" })
      .boundingBox())!;
    await page.mouse.move(divider.x + 500, divider.y + 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 500, divider.y - 160);
    await page.mouse.up();
    await page.getByLabel("Ripple", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Toggle snapping" }).click();
    await page.locator(".ruler").click({ position: { x: 160, y: 12 } });
    await page.keyboard.press("Control+b");
    await expect(page.locator(".clip-video")).toHaveCount(2);
    const id = await page
      .locator(".clip-video")
      .nth(1)
      .getAttribute("data-clip-id");
    const segment = page.locator(`[data-clip-id="${id}"]`);
    await page.getByLabel("Add track", { exact: true }).selectOption("video");
    const upper = page.locator(".track-row").first();
    let box = (await segment.boundingBox())!,
      target = (await upper.locator(".track-lane").boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, target.y + 25, { steps: 8 });
    await expect(upper.locator(".drag-ghost")).toHaveCount(1);
    await page.mouse.up();
    await expect(upper.locator(".clip-video")).toHaveCount(1);
    await expect(segment).toHaveCSS("left", "160px");
    await expect(page.locator(".clip-audio")).toHaveCount(0);
    box = (await segment.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x - 50, box.y + 15);
    await expect(page.locator(".drag-ghost")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".drag-ghost")).toHaveCount(0);
    await expect(segment).toHaveCSS("left", "160px");
    box = (await segment.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x - 50, box.y + 15, { steps: 5 });
    await page.mouse.up();
    await expect(segment).toHaveCSS("left", "80px");
    const snapshot = await save(app, page, "layers-before");
    const audioLane = page.locator(".track-row").last().locator(".track-lane");
    target = (await audioLane.boundingBox())!;
    box = (await segment.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, target.y + 25, { steps: 8 });
    await expect(page.getByRole("status")).toContainText("Invalid drop");
    await page.mouse.up();
    await expect(page.getByRole("alert")).toContainText("Invalid drop");
    expect((await save(app, page, "layers-before")).tracks).toEqual(
      snapshot.tracks,
    );
    await page.getByRole("button", { name: "Dismiss error" }).click();
    await segment.click({ button: "right", position: { x: 30, y: 15 } });
    await page
      .getByRole("menuitem", { name: "Separate linked audio", exact: true })
      .click();
    await expect(page.locator(".clip-audio")).toHaveCount(1);
    await page.getByLabel("Crop left (%)").fill("50");
    await page.getByLabel("Crop left (%)").press("Tab");
    box = (await segment.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 46, box.y + 15, { steps: 5 });
    await page.mouse.up();
    await expect(segment).toHaveCSS("left", "96px");
    await expect(page.locator(".clip-audio")).toHaveCSS("left", "96px");
    await page.locator(".ruler").click({ position: { x: 128, y: 28 } });
    await expect
      .poll(() =>
        page
          .locator("video[data-player]")
          .evaluateAll(
            (videos) =>
              videos.length === 3 &&
              videos.every(
                (v) =>
                  (v as HTMLVideoElement).readyState >= 2 &&
                  !(v as HTMLVideoElement).seeking,
              ),
          ),
      )
      .toBe(true);
    const decoded = await page
      .locator("video[data-player]")
      .evaluateAll((videos) =>
        videos.map((v) => ({
          time: (v as HTMLVideoElement).currentTime,
          muted: (v as HTMLVideoElement).muted,
        })),
      );
    expect(decoded.map((v) => Math.round(v.time * 10)).sort()).toEqual([
      16, 24, 24,
    ]);
    expect(decoded.filter((v) => v.muted)).toHaveLength(1);
    await page.getByRole("button", { name: "Toggle safe-area guides" }).click();
    const stage = (await page.locator(".stage-wrapper").boundingBox())!;
    const shot = path.join(root, "preview.png");
    await page.screenshot({ path: shot });
    const pixel = async (fraction: number) => [
      ...(await run("ffmpeg", [
        "-v",
        "error",
        "-i",
        shot,
        "-vf",
        `crop=2:2:${Math.round(stage.x + stage.width * fraction)}:${Math.round(stage.y + stage.height * 0.5)},scale=1:1`,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ])),
    ];
    expect((await pixel(0.25))[0]).toBeGreaterThan(220);
    expect((await pixel(0.75))[2]).toBeGreaterThan(220);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(
        () =>
          page
            .locator("video[data-player]")
            .evaluateAll(
              (videos) =>
                videos.length === 3 &&
                videos.every(
                  (v, index) =>
                    (v as HTMLVideoElement).currentTime >
                    (index === 1 ? 1.68 : 2.48),
                ),
            ),
        { intervals: [20, 40, 60] },
      )
      .toBe(true);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.locator(".ruler").click({ position: { x: 128, y: 28 } });
    // A slow decoder must stop the other layers, not only freeze the project clock.
    await page
      .locator("video[data-player]")
      .first()
      .evaluate((v) =>
        Object.defineProperty(v, "readyState", {
          configurable: true,
          get: () => 1,
        }),
      );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("video[data-player]")
          .evaluateAll((videos) =>
            videos.every((v) => (v as HTMLVideoElement).paused),
          ),
      )
      .toBe(true);
    const frozen = await page
      .getByRole("slider", { name: "Timeline playhead" })
      .getAttribute("aria-valuenow");
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 180)),
    );
    await expect(
      page.getByRole("slider", { name: "Timeline playhead" }),
    ).toHaveAttribute("aria-valuenow", frozen!);
    await page
      .locator("video[data-player]")
      .first()
      .evaluate((v) => {
        delete (v as any).readyState;
      });
    await expect
      .poll(
        () =>
          page
            .locator("video[data-player]")
            .evaluateAll((videos) =>
              videos.every((v) => !(v as HTMLVideoElement).paused),
            ),
        { intervals: [20, 40] },
      )
      .toBe(true);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.locator(".ruler").click({ position: { x: 128, y: 28 } });
    const data = await save(app, page, "layers-before");
    const visual = data.tracks[0].clips[0],
      audio = data.tracks.at(-1)!.clips[0];
    expect(visual.groupId).toBe(audio.groupId);
    expect(audio.timelineStart).toBe(1_200_000);
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      },
      path.join(root, "layers-before.shortcut"),
    );
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(page.locator(".statusbar .spinner")).toHaveCount(0);
    await expect(
      page.getByRole("slider", { name: "Timeline playhead" }),
    ).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator(".clip-audio")).toHaveCSS("left", "96px");
    await segment.click({ button: "right", position: { x: 30, y: 15 } });
    await page
      .getByRole("menuitem", { name: "Unlink Audio", exact: true })
      .click();
    await expect(segment.locator(".clip-name svg")).toHaveCount(0);
    const unlinked = await save(app, page, "layers-before");
    expect(
      unlinked.tracks.flatMap((t) => t.clips).every((c) => !c.groupId),
    ).toBe(true);
  } finally {
    await app.close();
  }
});

test("live inspector inputs and sliders preview before blur and commit single edits", async () => {
  const { app, page } = await launch("live-properties");
  try {
    const video = page.locator("video[data-player]");
    const rotation = page.getByLabel("Rotation", { exact: true });
    await rotation.fill("30");
    await expect(video).toHaveAttribute("style", /rotate\(30deg\)/);
    await rotation.press("Escape");
    await expect(video).toHaveAttribute("style", /rotate\(0deg\)/);
    await expect(rotation).toHaveValue("0");
    await rotation.fill("-");
    await expect(rotation).toHaveAttribute("aria-invalid", "true");
    await rotation.press("Escape");
    await expect(rotation).toHaveValue("0");
    await expect(rotation).toHaveAttribute("aria-invalid", "false");
    await expect(video).toHaveAttribute("style", /rotate\(0deg\)/);
    await rotation.fill("25");
    await expect(video).toHaveAttribute("style", /rotate\(25deg\)/);
    await rotation.press("Enter");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(video).toHaveAttribute("style", /rotate\(0deg\)/);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(video).toHaveAttribute("style", /rotate\(25deg\)/);
    const x = page.getByLabel("Position X", { exact: true });
    await x.fill("25");
    await expect(video).toHaveCSS("left", "105px");
    await x.press("Enter");
    const scale = page.getByLabel("Scale slider", { exact: true });
    await scale.scrollIntoViewIfNeeded();
    const box = (await scale.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, {
      steps: 8,
    });
    const effective = Number(
      await page.getByLabel("Scale (%)", { exact: true }).inputValue(),
    );
    expect(effective).toBeGreaterThan(150);
    await expect(video).toHaveAttribute(
      "style",
      new RegExp(`scale\\(${effective / 100}, ${effective / 100}\\)`),
    );
    await page.mouse.up();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Scale (%)", { exact: true })).toHaveValue(
      "100",
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByLabel("Scale (%)", { exact: true })).toHaveValue(
      String(effective),
    );
    const opacity = page.getByLabel("Opacity slider", { exact: true });
    await opacity.fill("45");
    await expect(video).toHaveCSS("opacity", "0.45");
    await opacity.press("Tab");
    const crop = page.getByLabel("Crop left (%)", { exact: true });
    await crop.fill("20");
    await expect(video).toHaveCSS("clip-path", "inset(0% 0% 0% 20%)");
    await crop.press("Enter");
    const data = await save(app, page, "live-properties");
    expect(data.tracks[1].clips[0]).toMatchObject({
      opacity: 0.45,
      transform: {
        x: 25,
        rotation: 25,
        scale: effective / 100,
        crop: { left: 0.2 },
      },
    });
    await page.screenshot({ path: "test-results/live-inspector.png" });
  } finally {
    await app.close();
  }
});

test("text dragging shares live coordinates, supports fit zoom, cancellation and one-step undo", async () => {
  const { app, page } = await launch("live-text");
  try {
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("button", { name: /Add caption at playhead/ }).click();
    const text = page.locator(".text-layer"),
      x = page.getByLabel("Position X", { exact: true }),
      y = page.getByLabel("Position Y", { exact: true });
    for (const zoom of ["1", "0.5"]) {
      await page.getByLabel("Preview zoom").selectOption(zoom);
      const beforeX = Number(await x.inputValue()),
        beforeY = Number(await y.inputValue());
      const box = (await text.boundingBox())!,
        stage = (await page.locator(".stage-wrapper").boundingBox())!,
        scale = stage.width / 160;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 24,
        box.y + box.height / 2 - 18,
        { steps: 8 },
      );
      const expectedX = Math.round(beforeX + 24 / scale),
        expectedY = Math.round(beforeY - 18 / scale);
      await expect(x).toHaveValue(String(expectedX));
      await expect(y).toHaveValue(String(expectedY));
      await expect(text).toHaveCSS("left", `${80 + expectedX}px`);
      await page.mouse.up();
      await expect(x).toHaveValue(String(expectedX));
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(x).toHaveValue(String(beforeX));
      await expect(y).toHaveValue(String(beforeY));
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      await expect(x).toHaveValue(String(expectedX));
      const moved = (await text.boundingBox())!;
      await page.mouse.move(
        moved.x + moved.width / 2,
        moved.y + moved.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        moved.x + moved.width / 2 + 20,
        moved.y + moved.height / 2,
        { steps: 4 },
      );
      await expect(x).not.toHaveValue(String(expectedX));
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(x).toHaveValue(String(expectedX));
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(x).toHaveValue(String(beforeX));
      await expect(y).toHaveValue(String(beforeY));
    }
    const font = page.getByLabel("Font size", { exact: true });
    const beforeCaptureLoss = await x.inputValue();
    await text.evaluate((node) =>
      node.addEventListener(
        "pointerdown",
        (event) => {
          (node as HTMLElement).dataset.pointerId = String(
            (event as PointerEvent).pointerId,
          );
        },
        { once: true },
      ),
    );
    const captureBox = (await text.boundingBox())!;
    await page.mouse.move(
      captureBox.x + captureBox.width / 2,
      captureBox.y + captureBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      captureBox.x + captureBox.width / 2 + 30,
      captureBox.y + captureBox.height / 2,
    );
    await expect(x).not.toHaveValue(beforeCaptureLoss);
    await text.evaluate((node) =>
      node.releasePointerCapture(
        Number((node as HTMLElement).dataset.pointerId),
      ),
    );
    await page.mouse.up();
    await expect(x).toHaveValue(beforeCaptureLoss);
    await font.fill("24");
    await expect(text).toHaveCSS("font-size", "24px");
    await font.press("Enter");
    const color = page.getByLabel("Text color", { exact: true });
    await color.fill("#11ff22");
    await expect(text).toHaveCSS("color", "rgb(17, 255, 34)");
    await color.press("Tab");
    await page.getByLabel("Caption text", { exact: true }).fill("Live caption");
    await expect(text).toHaveText("Live caption");
    await page.getByLabel("Caption text", { exact: true }).press("Tab");
    const saved = await save(app, page, "live-text");
    expect(saved.tracks[0].clips[0].text).toMatchObject({
      text: "Live caption",
      size: 24,
      color: "#11ff22",
    });
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      },
      path.join(root, "live-text.shortcut"),
    );
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(page.locator(".statusbar .spinner")).toHaveCount(0);
    await expect(text).toHaveText("Live caption");
    await expect(text).toHaveCSS("font-size", "24px");
  } finally {
    await app.close();
  }
});

test("smart before/after ghosts preserve links and marquee moves a cross-track selection", async () => {
  const { app, page } = await launch("smart-marquee");
  try {
    const divider = (await page
      .getByRole("separator", { name: "Resize bottom panel" })
      .boundingBox())!;
    await page.mouse.move(divider.x + 500, divider.y + 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 500, divider.y - 210);
    await page.mouse.up();
    await page
      .locator(".clip-video")
      .click({ button: "right", position: { x: 30, y: 15 } });
    await page
      .getByRole("menuitem", { name: "Separate linked audio", exact: true })
      .click();
    await page.locator(".ruler").click({ position: { x: 160, y: 28 } });
    await page.keyboard.press("Control+b");
    const rightId = await page
        .locator(".clip-video")
        .nth(1)
        .getAttribute("data-clip-id"),
      leftId = await page
        .locator(".clip-video")
        .first()
        .getAttribute("data-clip-id");
    const right = page.locator(`[data-clip-id="${rightId}"]`),
      left = page.locator(`[data-clip-id="${leftId}"]`);
    let source = (await right.boundingBox())!,
      zone = (await page.getByLabel("Create video track zone").boundingBox())!;
    await page.mouse.move(source.x + 30, source.y + 15);
    await page.mouse.down();
    await page.mouse.move(source.x + 30, zone.y + 14, { steps: 8 });
    await page.mouse.up();
    const original = await save(app, page, "smart-marquee");
    for (const side of ["before", "after"]) {
      source = (await right.boundingBox())!;
      const target = (await left.boundingBox())!;
      await page.mouse.move(source.x + 30, source.y + 15);
      await page.mouse.down();
      await page.mouse.move(
        target.x + (side === "before" ? 40 : 120),
        target.y + 15,
        { steps: 8 },
      );
      await expect(page.getByRole("status")).toContainText(`Insert ${side}`);
      await expect(page.locator(".drag-ghost")).not.toHaveCount(0);
      await page.mouse.up();
      await expect(right).toHaveCSS(
        "left",
        side === "before" ? "0px" : "160px",
      );
      await expect(left).toHaveCSS("left", side === "before" ? "160px" : "0px");
      const saved = await save(app, page, "smart-marquee");
      for (const c of saved.tracks
        .flatMap((t) => t.clips)
        .filter((c) => c.groupId))
        expect(
          saved.tracks
            .flatMap((t) => t.clips)
            .filter((v) => v.groupId === c.groupId)
            .every((v) => v.timelineStart === c.timelineStart),
        ).toBe(true);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(right).toHaveCSS("left", "160px");
    }
    const upper = (await right.locator("xpath=../..").boundingBox())!,
      audio = (await page
        .locator(".clip-audio")
        .first()
        .locator("xpath=../..")
        .boundingBox())!,
      ruler = (await page.locator(".ruler").boundingBox())!;
    await page.mouse.move(ruler.x + 420, upper.y + 70);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 1, audio.y + 70, { steps: 10 });
    await expect(page.locator(".selection-marquee")).toBeVisible();
    await expect(page.locator(".clip.selected")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".selection-marquee")).toHaveCount(0);
    await page.mouse.move(ruler.x + 420, upper.y + 3);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 1, audio.y + 70, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator(".clip.selected")).toHaveCount(4);
    source = (await right.boundingBox())!;
    await page.mouse.move(source.x + 30, source.y + 15);
    await page.mouse.down();
    await page.mouse.move(source.x + 110, source.y + 15, { steps: 8 });
    await page.mouse.up();
    const moved = await save(app, page, "smart-marquee");
    for (const c of moved.tracks.flatMap((t) => t.clips))
      expect(c.timelineStart).toBe(
        original.tracks.flatMap((t) => t.clips).find((v) => v.id === c.id)!
          .timelineStart + 1000000,
      );
    await page.getByRole("button", { name: "Duplicate selected" }).click();
    await expect(page.locator(".clip")).toHaveCount(8);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".clip")).toHaveCount(4);
    await page.screenshot({ path: "test-results/smart-marquee.png" });
    await page.getByLabel("Timeline zoom").fill("240");
    await page.locator(".timeline-scroll").evaluate((node) => {
      node.scrollLeft = 300;
      node.scrollTop = 40;
    });
    const scrolledRuler = (await page.locator(".ruler").boundingBox())!,
      scrolledUpper = (await right.locator("xpath=../..").boundingBox())!,
      scrolledAudio = (await page
        .locator(".clip-audio")
        .first()
        .locator("xpath=../..")
        .boundingBox())!;
    await page.mouse.move(scrolledRuler.x + 5.4 * 240, scrolledUpper.y + 3);
    await page.mouse.down();
    await page.mouse.move(scrolledRuler.x + 1.5 * 240, scrolledAudio.y + 70, {
      steps: 10,
    });
    await expect(page.locator(".clip.selected")).toHaveCount(4);
    await page.mouse.up();
    await expect(page.locator(".clip.selected")).toHaveCount(4);
  } finally {
    await app.close();
  }
});

test("library Ctrl/range/marquee selection drops ordered assets as one undoable batch", async () => {
  const { app, page } = await launch("library-multi");
  try {
    const second = path.join(root, "second.mp4");
    await copyFile(source, second);
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: files,
        });
      },
      [second, sound],
    );
    await page.getByRole("button", { name: /Import files/ }).click();
    await expect(page.locator(".media-card")).toHaveCount(3);
    const cards = page.locator(".media-card");
    await cards.nth(0).click({ position: { x: 20, y: 40 } });
    await cards
      .nth(1)
      .click({ position: { x: 20, y: 40 }, modifiers: ["Control"] });
    await expect(page.locator(".media-selection-count")).toHaveText(
      "2 selected",
    );
    const grid = page.locator(".media-grid"),
      bounds = (await grid.boundingBox())!,
      first = (await cards.first().boundingBox())!,
      last = (await cards.last().boundingBox())!;
    const emptyY = last.y + last.height / 2 - bounds.y;
    await page.mouse.move(bounds.x + bounds.width - 3, bounds.y + emptyY);
    await page.mouse.down();
    await page.mouse.move(first.x + 2, first.y + 2, { steps: 8 });
    await expect(page.locator(".media-selection-count")).toHaveText(
      "3 selected",
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".media-selection-count")).toHaveText(
      "2 selected",
    );
    await grid.click({ position: { x: bounds.width - 3, y: emptyY } });
    await expect(page.locator(".media-selection-count")).toHaveText(
      "0 selected",
    );
    await cards.first().click({ position: { x: 20, y: 40 } });
    await cards
      .nth(1)
      .click({ position: { x: 20, y: 40 }, modifiers: ["Shift"] });
    await expect(page.locator(".media-selection-count")).toHaveText(
      "2 selected",
    );
    await cards
      .first()
      .dragTo(page.locator(".clip-video").locator("xpath=.."), {
        targetPosition: { x: 320, y: 25 },
      });
    await expect(page.locator(".clip-video")).toHaveCount(3);
    const data = await save(app, page, "library-multi"),
      clips = data.tracks[1].clips;
    expect(clips.map((c) => c.timelineStart)).toEqual([0, 4000000, 8000000]);
    expect(clips.map((c) => c.name)).toEqual([
      "two-scenes.mp4",
      "two-scenes.mp4",
      "second.mp4",
    ]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(1);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(3);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await cards.first().click({ position: { x: 20, y: 40 } });
    await cards
      .last()
      .click({ position: { x: 20, y: 40 }, modifiers: ["Shift"] });
    await expect(page.locator(".media-selection-count")).toHaveText(
      "3 selected",
    );
    await cards
      .first()
      .dragTo(page.locator(".clip-video").locator("xpath=.."), {
        targetPosition: { x: 320, y: 25 },
      });
    await expect(page.locator(".clip-video")).toHaveCount(3);
    await expect(page.locator(".clip-audio")).toHaveCount(1);
    const mixed = await save(app, page, "library-multi");
    expect(
      mixed.tracks.flatMap((t) => t.clips).find((c) => c.name === "tone.wav")
        ?.timelineStart,
    ).toBe(12000000);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(1);
    await expect(page.locator(".clip-audio")).toHaveCount(0);
  } finally {
    await app.close();
  }
});
