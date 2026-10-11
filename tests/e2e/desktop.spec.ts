import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { run } from "../../electron/process";
import { probe } from "../../electron/media";
test("production desktop opens", async () => {
  const userData = path.resolve(".cache/smoke-profile");
  await mkdir(userData, { recursive: true });
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, SHORTCUT_DEV: "0", SHORTCUT_TEST_HOME: userData },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "ShortCut Studio" }),
    ).toBeVisible();
    await expect(page.getByText("Media engine ready")).toBeVisible({
      timeout: 30000,
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1920, 1080),
    );
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/desktop-1080.png" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1366, 768),
    );
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/desktop.png" });
  } finally {
    await app.close();
  }
});
test("drag/drop, trim handles, panel resize and input focus work", async () => {
  const root = path.resolve(`.cache/interactions-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, "clip.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=cyan:s=160x284:r=30:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
  const profile = path.join(root, "profile");
  await mkdir(profile, { recursive: true });
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, SHORTCUT_DEV: "0", SHORTCUT_TEST_HOME: profile },
  });
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
    await page.getByRole("button", { name: /Import files/ }).click();
    await expect(page.locator(".media-card")).toHaveCount(1);
    await page
      .locator(".media-card")
      .dragTo(page.locator(".track-lane").nth(1), {
        targetPosition: { x: 160, y: 25 },
      });
    const clip = page.locator(".clip-video");
    await expect(clip).toHaveCount(1);
    await expect(clip).toHaveCSS("left", "160px");
    let bounds = (await clip.boundingBox())!;
    await page.mouse.move(bounds.x + 30, bounds.y + 18);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 110, bounds.y + 18, { steps: 5 });
    await page.mouse.up();
    await expect(clip).toHaveCSS("left", "240px");
    bounds = (await clip.locator(".trim-handle.end").boundingBox())!;
    await page.mouse.move(bounds.x + 3, bounds.y + 20);
    await page.mouse.down();
    await page.mouse.move(bounds.x - 37, bounds.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect(clip).toHaveCSS("width", "120px");
    const separator = page.getByRole("separator", {
      name: "Resize left panel",
    });
    bounds = (await separator.boundingBox())!;
    await page.mouse.move(bounds.x + 2, bounds.y + 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 32, bounds.y + 30);
    await page.mouse.up();
    await expect(separator).toHaveAttribute("aria-valuenow", "290");
    await page.getByLabel("Clip name", { exact: true }).fill("Renamed clip");
    await page.getByLabel("Clip name", { exact: true }).press("Control+b");
    await expect(clip).toHaveCount(1);
    await page.getByLabel("Clip name", { exact: true }).press("Tab");
    const saved = path.join(root, "interaction.shortcut");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, saved);
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to disk", { exact: true }),
    ).toBeVisible();
    const data = JSON.parse(await readFile(saved, "utf8"));
    const c = data.tracks[1].clips[0];
    expect(c.timelineStart).toBe(3_000_000);
    expect(c.timelineDuration).toBe(1_500_000);
    expect(c.sourceOut).toBe(1_500_000);
    expect(c.name).toBe("Renamed clip");
  } finally {
    await app.close();
  }
});
test("eight-clip editing workflow imports, edits, previews, saves, reopens and exports", async () => {
  test.setTimeout(180000);
  const root = path.resolve(`.cache/workflow-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const files: string[] = [];
  const colors = [
    "red",
    "blue",
    "green",
    "yellow",
    "cyan",
    "magenta",
    "orange",
    "white",
  ];
  for (let i = 0; i < 8; i++) {
    const file = path.join(root, `scene-${i + 1}.mp4`);
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=${colors[i]}:s=160x284:r=30:d=2`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
    files.push(file);
  }
  for (const [name, length, frequency] of [
    ["narration.wav", "16", "440"],
    ["effect.wav", "0.3", "1200"],
  ]) {
    const file = path.join(root, name);
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
    files.push(file);
  }
  const userData = path.join(root, "profile");
  await mkdir(userData, { recursive: true });
  const launch = async () => {
    const instance = await electron.launch({
      args: ["."],
      env: { ...process.env, SHORTCUT_DEV: "0", SHORTCUT_TEST_HOME: userData },
    });
    await instance.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      dialog.showMessageBoxSync = () => 1;
    });
    return instance;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.getByText("Media engine ready")).toBeVisible({
      timeout: 30000,
    });
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await page.getByLabel("Width", { exact: true }).fill("320");
    await page.getByLabel("Width", { exact: true }).press("Tab");
    await page.getByLabel("Height", { exact: true }).fill("568");
    await page.getByLabel("Height", { exact: true }).press("Tab");
    await page.getByRole("button", { name: "Create project" }).click();
    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: paths,
      });
    }, files);
    await page.getByRole("button", { name: /Import files/ }).click();
    await expect(
      page.getByLabel("Add scene-8.mp4", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    for (let i = 1; i <= 8; i++)
      await page.getByLabel(`Add scene-${i}.mp4`, { exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(8);
    await page.getByLabel("Ripple", { exact: true }).check();
    await page
      .locator(".clip-video")
      .first()
      .click({ position: { x: 30, y: 15 } });
    await page.locator(".ruler").click({ position: { x: 80, y: 10 } });
    await page.keyboard.press("Control+b");
    await expect(page.locator(".clip-video")).toHaveCount(9);
    await page.keyboard.press("Delete");
    await expect(page.locator(".clip-video")).toHaveCount(8);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(9);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".clip-video")).toHaveCount(8);
    await page.locator(".timeline-scroll").evaluate((e) => {
      e.scrollLeft = 500;
    });
    await page
      .getByRole("button", { name: "Clip scene-8.mp4", exact: true })
      .click({ position: { x: 50, y: 16 } });
    await page.getByLabel("End (s)", { exact: true }).fill("14.5");
    await page.getByLabel("End (s)", { exact: true }).press("Tab");
    await page.getByLabel("Add narration.wav", { exact: true }).click();
    await page.getByLabel("Add track", { exact: true }).selectOption("audio");
    await page.getByLabel("Add effect.wav", { exact: true }).click();
    await page.getByLabel("Start (s)", { exact: true }).fill("5");
    await page.getByLabel("Start (s)", { exact: true }).press("Tab");
    await page.locator(".timeline-scroll").evaluate((e) => {
      e.scrollLeft = 0;
      e.scrollTop = 0;
    });
    await page.locator(".ruler").click({ position: { x: 160, y: 10 } });
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("button", { name: /Add caption at playhead/ }).click();
    await page
      .getByLabel("Caption text", { exact: true })
      .fill("Xin chào Việt Nam");
    await page.getByLabel("Caption text", { exact: true }).press("Tab");
    await expect(page.locator(".text-layer")).toContainText(
      "Xin chào Việt Nam",
    );
    await expect
      .poll(
        () =>
          page
            .locator("video[data-player]")
            .evaluateAll((v) =>
              v.every((e) => (e as HTMLVideoElement).readyState >= 2),
            ),
        { timeout: 15000 },
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator("video:visible")
          .first()
          .evaluate(
            (v: HTMLVideoElement) =>
              !v.seeking && Math.abs(v.currentTime - 1) < 0.06,
          ),
      )
      .toBe(true);
    const beforePlayback = await page
      .locator("video[data-player]")
      .first()
      .evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(
        async () =>
          page
            .locator("video[data-player]")
            .first()
            .evaluate((v: HTMLVideoElement) => v.currentTime),
        { timeout: 15000 },
      )
      .toBeGreaterThan(beforePlayback + 0.2);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.screenshot({ path: "test-results/workflow.png" });
    const saved = path.join(root, "workflow.shortcut");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, saved);
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to disk", { exact: true }),
    ).toBeVisible();
    const data = JSON.parse(await readFile(saved, "utf8"));
    expect(
      data.tracks.flatMap((t: any) => t.clips).filter((c: any) => c.text)[0]
        .text.text,
    ).toBe("Xin chào Việt Nam");
    expect(
      data.tracks.find((t: any) => t.name === "Video 1").clips[0].sourceIn,
    ).toBe(1_000_000);
    expect(
      data.tracks.find((t: any) => t.name === "Video 1").clips.at(-1)
        .timelineDuration,
    ).toBe(1_500_000);
    expect(
      data.tracks.find((t: any) => t.name === "Voice & music").clips[0]
        .timelineStart,
    ).toBe(0);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByText("Media engine ready")).toBeVisible({
      timeout: 30000,
    });
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, saved);
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(page.locator(".clip-video")).toHaveCount(8, {
      timeout: 30000,
    });
    const output = path.join(root, "workflow.mp4");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, output);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page
      .getByRole("button", { name: "Choose file & export", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open folder", exact: true }),
    ).toBeVisible({ timeout: 120000 });
    const metadata = await probe(output);
    expect(metadata.streams.find((s) => s.codec_type === "video")?.width).toBe(
      320,
    );
    expect(Number(metadata.format.duration)).toBeCloseTo(16, 1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: "test-results/export-complete.png" });
  } finally {
    await app.close();
  }
});
