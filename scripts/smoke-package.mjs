import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import { readdir, mkdir, writeFile } from "node:fs/promises";
const root = path.resolve(".cache/package-smoke");
await mkdir(root, { recursive: true });
const fixtures = (await readdir(".cache"))
  .filter((n) => n.startsWith("benchmark-"))
  .sort();
const fixture = path.resolve(".cache", fixtures.at(-1), "benchmark.shortcut");
const executablePath = path.resolve("release/win-unpacked/ShortCut Studio.exe");
const app = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${root}`],
});
try {
  const page = await app.firstWindow();
  await expect(
    page.getByRole("heading", { name: "ShortCut Studio" }),
  ).toBeVisible();
  await expect(page.getByText("Media engine ready")).toBeVisible({
    timeout: 30000,
  });
  const packaged = await app.evaluate(({ app }) => app.isPackaged);
  if (!packaged) throw new Error("Expected packaged runtime.");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, fixture);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await expect(page.getByText("Saved to disk", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.locator(".ruler").click({ position: { x: 80, y: 10 } });
  await expect
    .poll(
      () =>
        page
          .locator("video:visible")
          .first()
          .evaluate(
            (v) =>
              v.readyState >= 2 &&
              !v.seeking &&
              Math.abs(v.currentTime - 1) < 0.06,
          ),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video:visible")
        .first()
        .evaluate((v) => v.currentTime),
    )
    .toBeGreaterThan(1.3);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const handle = page.getByRole("slider", { name: "Timeline playhead" });
  const bounds = await handle.boundingBox();
  const ruler = await page.locator(".ruler").boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 8);
  await page.mouse.down();
  await page.mouse.move(ruler.x + 80, ruler.y - 50, { steps: 8 });
  await expect(handle).toHaveAttribute("aria-valuenow", "1000000");
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator("video:visible")
        .first()
        .evaluate((v) => !v.seeking && Math.abs(v.currentTime - 1) < 0.005),
    )
    .toBe(true);
  await page
    .locator(".clip-video")
    .first()
    .click({ position: { x: 30, y: 15 } });
  const rotation = page.getByLabel("Rotation", { exact: true });
  const originalRotation = await rotation.inputValue();
  await rotation.fill("15");
  await expect(page.locator('video[style*="rotate(15deg)"]')).toBeVisible();
  await rotation.press("Escape");
  await expect(rotation).toHaveValue(originalRotation);
  await page.screenshot({ path: "test-results/packaged.png" });
  const report = {
    packaged,
    executablePath,
    checked: [
      "production window",
      "FFmpeg discovery",
      "real 1080p project open",
      "byte-range seek",
      "playback advancement",
      "captured playhead scrub outside ruler",
      "live rotation before blur and Escape restore",
      "no UI errors",
    ],
    developmentServer: false,
  };
  await writeFile("docs/package-smoke.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await app.close();
}
