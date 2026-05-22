import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function escapeAppleScript(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function chooseSavePath(defaultName: string) {
  const script = `POSIX path of (choose file name with prompt "Save edited image as PNG" default name "${escapeAppleScript(defaultName)}")`;

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

export async function savePngToChosenLocation(
  resultPath: string,
  baseName: string,
) {
  const defaultName = baseName.endsWith(".png") ? baseName : `${baseName}.png`;
  const selectedPath = await chooseSavePath(defaultName);

  if (!selectedPath) {
    return null;
  }

  const targetPath = selectedPath.toLowerCase().endsWith(".png")
    ? selectedPath
    : `${selectedPath}.png`;
  await fs.copyFile(resultPath, targetPath);
  return path.resolve(targetPath);
}
