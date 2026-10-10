import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";
const compile = spawn(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"],
  { stdio: "inherit" },
);
compile.on("exit", async (code) => {
  if (code) process.exit(code);
  const server = await createServer();
  await server.listen();
  const child = spawn(electron, ["."], {
    stdio: "inherit",
    env: { ...process.env, SHORTCUT_DEV: "1" },
  });
  child.on("exit", async (result) => {
    await server.close();
    process.exit(result ?? 0);
  });
});
