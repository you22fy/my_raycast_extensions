import { environment } from "@raycast/api";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BLOB_SIZE } from "./blob";

const execFileAsync = promisify(execFile);
const TEMP_ROOT = path.join(os.tmpdir(), "raycast-my-blob-generator");

function escapeAppleScript(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function cleanupGeneratedFiles(maxAgeMs = 1000 * 60 * 60 * 24) {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  const entries = await fs.readdir(TEMP_ROOT, { withFileTypes: true });
  const now = Date.now();

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(TEMP_ROOT, entry.name);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.rm(filePath, { force: true });
          }
        } catch {
          return;
        }
      }),
  );
}

export async function renderSvgToPng(svg: string, id: string) {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  const inputPath = path.join(TEMP_ROOT, `${id}.svg`);
  const outputPath = path.join(TEMP_ROOT, `${id}.png`);
  const bridgePath = path.join(
    environment.assetsPath,
    "swift",
    "svg-to-png.swift",
  );

  await fs.writeFile(inputPath, svg, "utf8");
  try {
    await execFileAsync("/usr/bin/swift", [
      bridgePath,
      inputPath,
      outputPath,
      String(BLOB_SIZE),
    ]);
  } finally {
    await fs.rm(inputPath, { force: true });
  }

  return outputPath;
}

export async function chooseSavePath(
  defaultName: string,
  format: "PNG" | "SVG",
) {
  const prompt = `Save blob as ${format}`;
  const script = `POSIX path of (choose file name with prompt "${prompt}" default name "${escapeAppleScript(defaultName)}")`;

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      script,
    ]);
    return stdout.trim();
  } catch (error) {
    const stderr =
      typeof error === "object" && error != null && "stderr" in error
        ? String(error.stderr ?? "")
        : "";
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("User canceled") || stderr.includes("User canceled")) {
      return null;
    }
    throw error;
  }
}

function ensureExtension(selectedPath: string, extension: ".png" | ".svg") {
  return selectedPath.toLowerCase().endsWith(extension)
    ? selectedPath
    : `${selectedPath}${extension}`;
}

export async function savePng(pngPath: string, defaultName: string) {
  const selectedPath = await chooseSavePath(defaultName, "PNG");
  if (!selectedPath) {
    return null;
  }
  const targetPath = ensureExtension(selectedPath, ".png");
  await fs.copyFile(pngPath, targetPath);
  return path.resolve(targetPath);
}

export async function saveSvg(svg: string, defaultName: string) {
  const selectedPath = await chooseSavePath(defaultName, "SVG");
  if (!selectedPath) {
    return null;
  }
  const targetPath = ensureExtension(selectedPath, ".svg");
  await fs.writeFile(targetPath, svg, "utf8");
  return path.resolve(targetPath);
}
