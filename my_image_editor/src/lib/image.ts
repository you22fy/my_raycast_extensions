import { Clipboard } from "@raycast/api";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getAssetPath } from "./paths";

const execFileAsync = promisify(execFile);

export type ImageDimensions = {
  width: number;
  height: number;
};

async function runBridge(args: string[]) {
  await execFileAsync("/usr/bin/swift", [
    getAssetPath("swift", "image-bridge.swift"),
    ...args,
  ]);
}

export function normalizeInputPath(inputPath: string) {
  if (inputPath.startsWith("file://")) {
    return fileURLToPath(inputPath);
  }

  return inputPath;
}

export async function convertImageFileToPng(
  inputPath: string,
  outputPath: string,
) {
  await runBridge(["convert", normalizeInputPath(inputPath), outputPath]);
}

export async function clipboardImageToPng(outputPath: string) {
  const clipboard = await Clipboard.read();

  if (clipboard.file) {
    await convertImageFileToPng(clipboard.file, outputPath);
    return;
  }

  await runBridge(["clipboard", outputPath]);
}

export async function getImageDimensions(
  imagePath: string,
): Promise<ImageDimensions> {
  const { stdout } = await execFileAsync("/usr/bin/sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    normalizeInputPath(imagePath),
  ]);
  const widthMatch = stdout.match(/pixelWidth:\s+(\d+)/);
  const heightMatch = stdout.match(/pixelHeight:\s+(\d+)/);

  if (!widthMatch || !heightMatch) {
    throw new Error("Could not determine image dimensions");
  }

  return {
    width: Number(widthMatch[1]),
    height: Number(heightMatch[1]),
  };
}

type TextOperation = {
  inputPath: string;
  outputPath: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
};

type RectangleOperation = {
  inputPath: string;
  outputPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  color: string;
};

type BlurOperation = {
  inputPath: string;
  outputPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export async function addTextToImage({
  inputPath,
  outputPath,
  text,
  x,
  y,
  fontSize,
  color,
}: TextOperation) {
  await runBridge([
    "text",
    normalizeInputPath(inputPath),
    outputPath,
    text,
    String(x),
    String(y),
    String(fontSize),
    color,
  ]);
}

export async function drawRectangleOnImage({
  inputPath,
  outputPath,
  x,
  y,
  width,
  height,
  strokeWidth,
  color,
}: RectangleOperation) {
  await runBridge([
    "rectangle",
    normalizeInputPath(inputPath),
    outputPath,
    String(x),
    String(y),
    String(width),
    String(height),
    String(strokeWidth),
    color,
  ]);
}

export async function blurImageRegion({
  inputPath,
  outputPath,
  x,
  y,
  width,
  height,
  radius,
}: BlurOperation) {
  await runBridge([
    "blur",
    normalizeInputPath(inputPath),
    outputPath,
    String(x),
    String(y),
    String(width),
    String(height),
    String(radius),
  ]);
}

export async function editImageWithMouse(
  inputPath: string,
  outputPath: string,
) {
  try {
    await runBridge(["interactive", normalizeInputPath(inputPath), outputPath]);
    return true;
  } catch (error) {
    const stderr =
      typeof error === "object" && error != null && "stderr" in error
        ? String(error.stderr ?? "")
        : "";
    if (stderr.includes("cancelled")) {
      return false;
    }
    throw error;
  }
}
