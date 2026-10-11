import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  importAsset,
  makeProxy,
  pruneCache,
  validateReplacement,
} from "./media.js";
import { atomicWrite, readProject, saveProject } from "./project.js";
import { detectNvenc, render } from "./render.js";
import { run } from "./process.js";
import {
  type MediaAsset,
  type Project,
  validateProject,
  serializeProject,
} from "../src/editor/model.js";
import type { ExportOptions } from "../src/types/bridge.js";
export const mediaFiles = new Map<string, string>();
const assets = new Map<string, MediaAsset>(),
  projects = new Set<string>();
let exportJob: AbortController | undefined;
let exportDone: Promise<void> | undefined;
export const isExporting = () => !!exportJob;
export const stopJobs = async () => {
  const done = exportDone;
  exportJob?.abort();
  await done;
};
export async function setupServices(window: BrowserWindow) {
  const data = app.getPath("userData"),
    cache = path.join(data, "cache"),
    recovery = path.join(data, "recovery.shortcut"),
    recentFile = path.join(data, "recent.json");
  let recent: string[] = [],
    lastOutput = "",
    importBusy = false,
    recoveryWrite = Promise.resolve();
  const queueRecovery = <T>(action: () => Promise<T>): Promise<T> => {
    const job = recoveryWrite.catch(() => {}).then(action);
    recoveryWrite = job.then(
      () => {},
      () => {},
    );
    return job;
  };
  await mkdir(data, { recursive: true });
  await pruneCache(cache);
  try {
    const saved: unknown = JSON.parse(await readFile(recentFile, "utf8"));
    if (Array.isArray(saved))
      recent = saved
        .filter((p): p is string => typeof p === "string" && path.isAbsolute(p))
        .slice(0, 12);
  } catch {
    /* First launch has no recent list. */
  }
  const mediaUrls = new Map<string, string>();
  const mediaUrl = (file: string) => {
    const existing = mediaUrls.get(file);
    if (existing) return existing;
    if (mediaFiles.size >= 6000)
      throw new Error(
        "Session media limit reached. Save and restart to release unused media.",
      );
    const id = randomUUID(),
      url = `media://local/${id}`;
    mediaFiles.set(id, file);
    mediaUrls.set(file, url);
    return url;
  };
  const expose = (asset: MediaAsset): MediaAsset => {
    assets.set(asset.id, asset);
    return {
      ...asset,
      missing: false,
      url: mediaUrl(asset.path),
      thumbnail: asset.thumbnail ? mediaUrl(asset.thumbnail) : undefined,
    };
  };
  const remember = async (file: string) => {
    recent = [file, ...recent.filter((f) => f !== file)].slice(0, 12);
    await atomicWrite(recentFile, JSON.stringify(recent));
  };
  const importFiles = async (paths: string[]) => {
    if (importBusy)
      throw new Error("Another import is running. Wait for it to finish.");
    if (
      !Array.isArray(paths) ||
      paths.length > 100 ||
      assets.size + paths.length > 2000
    )
      throw new Error("Import up to 100 files at a time, 2000 per session.");
    importBusy = true;
    const result: { assets: MediaAsset[]; errors: string[] } = {
      assets: [],
      errors: [],
    };
    try {
      for (const file of paths) {
        try {
          result.assets.push(expose(await importAsset(file, cache)));
        } catch (error) {
          result.errors.push(
            `${path.basename(String(file))}: ${(error as Error).message}`,
          );
        }
      }
    } finally {
      importBusy = false;
    }
    return result;
  };
  const hydrate = async (project: Project) => {
    if (
      assets.size +
        project.mediaAssets.filter((a) => !assets.has(a.id)).length >
      2000
    )
      throw new Error(
        "Session asset limit reached. Restart to open this project.",
      );
    for (let i = 0; i < project.mediaAssets.length; i++) {
      const original = project.mediaAssets[i];
      try {
        const loaded = await importAsset(original.path, cache);
        validateReplacement(original, loaded);
        project.mediaAssets[i] = expose({
          ...loaded,
          id: original.id,
          folder: original.folder,
          favorite: original.favorite,
        });
      } catch {
        project.mediaAssets[i] = { ...original, missing: true };
      }
    }
    validateProject(project);
    return project;
  };
  const trustedProject = (input: unknown): Project => {
    validateProject(input);
    for (const a of input.mediaAssets) {
      const authorized = assets.get(a.id);
      if (
        !a.missing &&
        (!authorized || path.resolve(authorized.path) !== path.resolve(a.path))
      )
        throw new Error("Import or relink media before using it.");
      if (
        authorized &&
        !a.missing &&
        (a.type !== authorized.type ||
          a.duration !== authorized.duration ||
          a.width !== authorized.width ||
          a.height !== authorized.height ||
          a.hasAudio !== authorized.hasAudio)
      )
        throw new Error("Media metadata changed. Reimport this file.");
    }
    return input;
  };
  const handle = (name: string, action: (...args: any[]) => unknown) => {
    ipcMain.handle(name, (event, ...args: unknown[]) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error("Untrusted request.");
      return action(...args);
    });
  };
  let environment:
    Promise<{ ffmpeg: boolean; version: string; nvenc: boolean }> | undefined;
  handle("environment", async () => {
    environment ??= (async () => {
      try {
        const version = (await run("ffmpeg", ["-version"]))
          .toString()
          .split("\n")[0];
        await run("ffprobe", ["-version"]);
        return { ffmpeg: true, version, nvenc: await detectNvenc() };
      } catch (error) {
        return {
          ffmpeg: false,
          version: (error as Error).message,
          nvenc: false,
        };
      }
    })();
    return {
      ...(await environment),
      recovery: await access(recovery)
        .then(() => true)
        .catch(() => false),
      recent,
    };
  });
  handle("import-media", async () => {
    const pick = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media",
          extensions: [
            "mp4",
            "mov",
            "mkv",
            "webm",
            "mp3",
            "wav",
            "aac",
            "m4a",
            "png",
            "jpg",
            "jpeg",
            "webp",
          ],
        },
      ],
    });
    return importFiles(pick.canceled ? [] : pick.filePaths);
  });
  handle("import-dropped", importFiles);
  handle("relink", async (asset: MediaAsset) => {
    const pick = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      title: `Relink ${String(asset.name).slice(0, 120)}`,
    });
    if (pick.canceled) return null;
    const loaded = await importAsset(pick.filePaths[0], cache);
    validateReplacement(asset, loaded);
    return expose({
      ...loaded,
      id: asset.id,
      folder: asset.folder,
      favorite: asset.favorite,
    });
  });
  handle("proxy", async (assetId: string) => {
    const asset = assets.get(assetId);
    if (!asset) throw new Error("Import media first.");
    const proxy = await makeProxy(asset, cache);
    return {
      ...asset,
      url: mediaUrl(proxy),
      thumbnail: asset.thumbnail ? mediaUrl(asset.thumbnail) : undefined,
    };
  });
  handle("open-project", async (file?: string) => {
    if (file && !recent.includes(file))
      throw new Error("Choose project using Open.");
    if (!file) {
      const pick = await dialog.showOpenDialog(window, {
        properties: ["openFile"],
        filters: [{ name: "ShortCut project", extensions: ["shortcut"] }],
      });
      if (pick.canceled) return null;
      file = pick.filePaths[0];
    }
    const project = await hydrate(await readProject(file));
    projects.add(file);
    await remember(file);
    return { project, path: file };
  });
  handle(
    "save-project",
    async (input: unknown, file: string | null, saveAs: boolean) => {
      const project = trustedProject(input);
      if (file && !projects.has(file))
        throw new Error("Save As required for this project path.");
      if (!file || saveAs) {
        const pick = await dialog.showSaveDialog(window, {
          defaultPath: `${project.name.replace(/[<>:"/\\|?*]/g, "_")}.shortcut`,
          filters: [{ name: "ShortCut project", extensions: ["shortcut"] }],
        });
        if (pick.canceled || !pick.filePath) return null;
        file = pick.filePath;
      }
      if (path.extname(file).toLowerCase() !== ".shortcut")
        throw new Error("Project filename must end in .shortcut.");
      await saveProject(file, project);
      projects.add(file);
      await remember(file);
      return file;
    },
  );
  handle("autosave", async (input: unknown) => {
    const text = serializeProject(trustedProject(input));
    await queueRecovery(() => atomicWrite(recovery, text));
  });
  handle("recover", async () => {
    const project = await queueRecovery(async () => {
      try {
        return await readProject(recovery);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    });
    return project ? { project: await hydrate(project), path: null } : null;
  });
  handle("clear-recovery", async () => {
    await queueRecovery(() => rm(recovery, { force: true }));
  });
  handle("import-srt", async () => {
    const pick = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    if (pick.canceled) return null;
    if ((await stat(pick.filePaths[0])).size > 2_000_000)
      throw new Error("SRT exceeds 2 MB.");
    return readFile(pick.filePaths[0], "utf8");
  });
  handle("save-srt", async (text: string) => {
    if (typeof text !== "string" || text.length > 2_000_000)
      throw new Error("Invalid subtitle data.");
    const pick = await dialog.showSaveDialog(window, {
      defaultPath: "captions.srt",
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    if (!pick.canceled && pick.filePath) {
      if (path.extname(pick.filePath).toLowerCase() !== ".srt")
        throw new Error("Use .srt extension.");
      await atomicWrite(pick.filePath, text);
    }
  });
  handle("export-video", async (input: unknown, options: ExportOptions) => {
    if (exportJob) throw new Error("An export is already running.");
    const project = trustedProject(input);
    exportJob = new AbortController();
    let finish!: () => void;
    exportDone = new Promise((resolve) => {
      finish = resolve;
    });
    try {
      const pick = await dialog.showSaveDialog(window, {
        defaultPath: "ShortCut-export.mp4",
        filters: [{ name: "MP4 video", extensions: ["mp4"] }],
      });
      if (pick.canceled || !pick.filePath) return null;
      if (path.extname(pick.filePath).toLowerCase() !== ".mp4")
        throw new Error("Export filename must end in .mp4.");
      if (
        await access(pick.filePath)
          .then(() => true)
          .catch(() => false)
      )
        throw new Error(
          "Output already exists. Choose a new filename to preserve existing files.",
        );
      lastOutput = await render(
        project,
        pick.filePath,
        options,
        exportJob.signal,
        (progress) => {
          if (!window.isDestroyed())
            window.webContents.send("export-progress", progress);
        },
      );
      return lastOutput;
    } finally {
      exportJob = undefined;
      exportDone = undefined;
      finish();
    }
  });
  handle("cancel-export", stopJobs);
  handle("show-output", () => {
    if (lastOutput) shell.showItemInFolder(lastOutput);
  });
}
