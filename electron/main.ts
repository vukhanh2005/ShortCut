import { app, BrowserWindow, dialog, protocol, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaResponse } from "./media-response.js";
import {
  setupServices,
  mediaFiles,
  stopJobs,
  isExporting,
} from "./services.js";
const dirname = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
app
  .whenReady()
  .then(async () => {
    if (!app.isPackaged && process.env.SHORTCUT_TEST_HOME)
      app.setPath("userData", process.env.SHORTCUT_TEST_HOME);
    protocol.handle("media", async (request) => {
      const url = new URL(request.url),
        file = mediaFiles.get(url.pathname.slice(1));
      if (url.hostname !== "local" || !file)
        return new Response("Not found", { status: 404 });
      try {
        return await mediaResponse(file, request);
      } catch {
        return new Response("Media unavailable. Relink source file.", {
          status: 404,
        });
      }
    });
    Menu.setApplicationMenu(null);
    const window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1000,
      minHeight: 650,
      backgroundColor: "#111417",
      title: "ShortCut Studio",
      webPreferences: {
        preload: path.join(dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    await setupServices(window);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-prevent-unload", (event) => {
      const choice = dialog.showMessageBoxSync(window, {
        type: "warning",
        buttons: ["Keep editing", "Discard and close"],
        defaultId: 0,
        cancelId: 0,
        message: "Close with unsaved changes?",
        detail:
          "Use Save to keep the project. A recent recovery copy may be available next launch.",
      });
      if (choice === 1) event.preventDefault();
    });
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    if (!app.isPackaged && process.env.SHORTCUT_DEV === "1")
      await window.loadURL("http://127.0.0.1:5173");
    else await window.loadFile(path.join(dirname, "../../dist/index.html"));
  })
  .catch((error) => {
    dialog.showErrorBox("ShortCut Studio startup failed", String(error));
    app.quit();
  });
app.on("before-quit", (event) => {
  if (isExporting()) {
    event.preventDefault();
    void stopJobs().then(() => app.quit());
  }
});
app.on("window-all-closed", () => app.quit());
