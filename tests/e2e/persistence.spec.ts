import { test, expect, _electron as electron } from "@playwright/test";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { run } from "../../electron/process";
import { newProject, type Project } from "../../src/editor/model";

test("recovery operations serialize, delayed open preserves edits, and abnormal exit restores latest project", async () => {
  const root = path.resolve(`.cache/recovery-${Date.now()}`),
    profile = path.join(root, "profile"),
    file = path.join(root, "saved.shortcut");
  await mkdir(profile, { recursive: true });
  const launch = async () => {
    const instance = await electron.launch({
      args: ["."],
      env: { ...process.env, SHORTCUT_DEV: "0", SHORTCUT_TEST_HOME: profile },
    });
    await instance.firstWindow();
    await instance.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    return instance;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByText("Media engine ready")).toBeVisible({
      timeout: 30000,
    });
    const first = newProject(),
      latest = newProject();
    first.name = "Old recovery";
    latest.name = "Latest recovery";
    const recovered = await page.evaluate(
      async ({ first, latest }) => {
        await Promise.all([
          window.studio.autosave(first),
          window.studio.clearRecovery(),
          window.studio.autosave(latest),
        ]);
        return window.studio.recover();
      },
      { first, latest },
    );
    expect(recovered!.project.name).toBe("Latest recovery");
    await page.evaluate(() => window.studio.clearRecovery());
    expect(await page.evaluate(() => window.studio.recover())).toBeNull();
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("button", { name: /Add caption at playhead/ }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      dialog.showMessageBoxSync = () => 1;
    }, file);
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to disk", { exact: true }),
    ).toBeVisible();
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = () =>
        new Promise((resolve) => {
          (globalThis as any).finishOpen = resolve;
        });
    });
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(
      page.getByText("Opening project", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Caption text", { exact: true })
      .fill("Keep edits made during open");
    await page.getByLabel("Caption text", { exact: true }).press("Tab");
    await app.evaluate((_electron, file) => {
      (globalThis as any).finishOpen({ canceled: false, filePaths: [file] });
    }, file);
    await expect(page.getByRole("alert")).toContainText(
      "Current edits were kept",
    );
    await expect(page.locator(".text-layer")).toHaveText(
      "Keep edits made during open",
    );
    await expect
      .poll(
        async () => {
          try {
            return JSON.parse(
              await readFile(path.join(profile, "recovery.shortcut"), "utf8"),
            ).tracks[0].clips[0].text.text;
          } catch {
            return null;
          }
        },
        { timeout: 15000 },
      )
      .toBe("Keep edits made during open");
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Restore recovery" }),
    ).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Restore recovery" }).click();
    await expect(page.locator(".text-layer")).toHaveText(
      "Keep edits made during open",
    );
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await page.locator(".clip-subtitle").click({ position: { x: 40, y: 15 } });
    await page
      .getByLabel("Caption text", { exact: true })
      .fill("Temporary recovery edit");
    await page.getByLabel("Caption text", { exact: true }).press("Tab");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to disk", { exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test("shortened source opens as missing without losing edits and can be relinked", async () => {
  const root = path.resolve(`.cache/relink-${Date.now()}`),
    profile = path.join(root, "profile"),
    source = path.join(root, "source.mp4"),
    replacement = path.join(root, "replacement.mp4"),
    file = path.join(root, "saved.shortcut");
  await mkdir(profile, { recursive: true });
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=160x284:r=30:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    source,
  ]);
  await copyFile(source, replacement);
  const launch = async () => {
    const instance = await electron.launch({
      args: ["."],
      env: { ...process.env, SHORTCUT_DEV: "0", SHORTCUT_TEST_HOME: profile },
    });
    await instance.firstWindow();
    await instance.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    return instance;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByText("Media engine ready")).toBeVisible({
      timeout: 30000,
    });
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, source);
    await page.getByRole("button", { name: /Import files/ }).click();
    await page.getByLabel("Add source.mp4", { exact: true }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to disk", { exact: true }),
    ).toBeVisible();
    const before = JSON.parse(await readFile(file, "utf8")) as Project;
    await app.close();
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      replacement,
      "-t",
      "1",
      "-c",
      "copy",
      source,
    ]);
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
    }, file);
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(
      page.getByText("Missing file - relink", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".clip-video")).toHaveCount(1);
    await page.locator(".media-card summary").click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, replacement);
    await page
      .getByRole("button", { name: "Relink file", exact: true })
      .click();
    await expect(
      page.getByText("Missing file - relink", { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .locator("video[data-player]")
          .evaluate((v: HTMLVideoElement) => v.readyState >= 2),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to disk", { exact: true }),
    ).toBeVisible();
    const after = JSON.parse(await readFile(file, "utf8")) as Project;
    expect(after.tracks).toEqual(before.tracks);
    expect(after.mediaAssets[0].path).toBe(replacement);
  } finally {
    await app.close();
  }
});
