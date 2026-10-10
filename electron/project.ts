import { open, readFile, rename, copyFile, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  type Project,
  parseProject,
  serializeProject,
} from "../src/editor/model.js";
export async function atomicWrite(file: string, text: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await copyFile(file, `${file}.bak`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function saveProject(
  file: string,
  project: Project,
): Promise<void> {
  await atomicWrite(file, serializeProject(project));
}
export async function readProject(file: string): Promise<Project> {
  if ((await stat(file)).size > 16 * 1024 * 1024)
    throw new Error("Project exceeds 16 MB.");
  return parseProject(await readFile(file, "utf8"));
}
