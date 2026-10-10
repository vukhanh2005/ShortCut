import { contextBridge, ipcRenderer, webUtils } from "electron";
const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("studio", {
  environment: () => invoke("environment"),
  importMedia: () => invoke("import-media"),
  importDropped: (files: File[]) =>
    invoke(
      "import-dropped",
      files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
    ),
  relink: (asset: unknown) => invoke("relink", asset),
  proxy: (id: string) => invoke("proxy", id),
  openProject: (recent?: string) => invoke("open-project", recent),
  saveProject: (project: unknown, file: string | null, saveAs = false) =>
    invoke("save-project", project, file, saveAs),
  autosave: (project: unknown) => invoke("autosave", project),
  recover: () => invoke("recover"),
  clearRecovery: () => invoke("clear-recovery"),
  importSrt: () => invoke("import-srt"),
  saveSrt: (text: string) => invoke("save-srt", text),
  exportVideo: (project: unknown, options: unknown) =>
    invoke("export-video", project, options),
  cancelExport: () => invoke("cancel-export"),
  showOutput: () => invoke("show-output"),
  onProgress: (callback: (progress: unknown) => void) => {
    const listener = (_event: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on("export-progress", listener);
    return () => ipcRenderer.removeListener("export-progress", listener);
  },
});
