import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dirname = path.dirname(fileURLToPath(import.meta.url));
app.whenReady().then(async () => {
const window = new BrowserWindow({ width: 1440, height: 900, minWidth: 1000, minHeight: 650, backgroundColor: '#111417', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
if (!app.isPackaged && process.env.SHORTCUT_DEV === '1') await window.loadURL('http://127.0.0.1:5173');
else await window.loadFile(path.join(dirname, '../../dist/index.html'));
app.on('window-all-closed', () => app.quit());
});
