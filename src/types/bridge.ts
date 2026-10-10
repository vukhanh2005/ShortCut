import type { MediaAsset, Project } from "../editor/model.js";
export interface ExportOptions {
  quality: number;
  audioBitrate: number;
  hardware: boolean;
}
export interface ExportProgress {
  fraction: number;
  message: string;
}
export interface ProjectFile {
  project: Project;
  path: string | null;
}
export interface Bridge {
  environment(): Promise<{
    ffmpeg: boolean;
    version: string;
    nvenc: boolean;
    recovery: boolean;
    recent: string[];
  }>;
  importMedia(): Promise<{ assets: MediaAsset[]; errors: string[] }>;
  importDropped(
    files: File[],
  ): Promise<{ assets: MediaAsset[]; errors: string[] }>;
  relink(asset: MediaAsset): Promise<MediaAsset | null>;
  proxy(assetId: string): Promise<MediaAsset>;
  openProject(recent?: string): Promise<ProjectFile | null>;
  saveProject(
    project: Project,
    path: string | null,
    saveAs?: boolean,
  ): Promise<string | null>;
  autosave(project: Project): Promise<void>;
  recover(): Promise<ProjectFile | null>;
  clearRecovery(): Promise<void>;
  importSrt(): Promise<string | null>;
  saveSrt(text: string): Promise<void>;
  exportVideo(project: Project, options: ExportOptions): Promise<string | null>;
  cancelExport(): Promise<void>;
  showOutput(): Promise<void>;
  onProgress(callback: (progress: ExportProgress) => void): () => void;
}
declare global {
  interface Window {
    studio: Bridge;
  }
}
