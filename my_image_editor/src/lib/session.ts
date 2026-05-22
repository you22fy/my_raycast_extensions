import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clipboardImageToPng,
  convertImageFileToPng,
  getImageDimensions,
  normalizeInputPath,
} from "./image";

export type ImageSession = {
  id: string;
  fileName: string;
  sessionDir: string;
  sourcePath: string;
  resultPath: string;
  updatedAt: string;
  createdAt: string;
  source: "clipboard" | "file";
  width: number;
  height: number;
};

const SESSION_ROOT = path.join(os.tmpdir(), "raycast-my-image-editor");
const SESSION_FILE = "session.json";
const SOURCE_FILE = "source.png";
const RESULT_FILE = "result.png";

async function ensureSessionRoot() {
  await fs.mkdir(SESSION_ROOT, { recursive: true });
}

function createSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sessionFilePath(sessionDir: string) {
  return path.join(sessionDir, SESSION_FILE);
}

function resultFilePath(sessionDir: string) {
  return path.join(sessionDir, RESULT_FILE);
}

function sourceFilePath(sessionDir: string) {
  return path.join(sessionDir, SOURCE_FILE);
}

async function writeSession(session: ImageSession) {
  await fs.writeFile(
    sessionFilePath(session.sessionDir),
    JSON.stringify(session, null, 2),
    "utf8",
  );
}

export async function cleanupOldSessions(maxAgeMs = 1000 * 60 * 60 * 24) {
  await ensureSessionRoot();
  const now = Date.now();
  const entries = await fs.readdir(SESSION_ROOT, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const target = path.join(SESSION_ROOT, entry.name);
        try {
          const stats = await fs.stat(target);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.rm(target, { recursive: true, force: true });
          }
        } catch {
          return;
        }
      }),
  );
}

async function createSessionBase(
  source: ImageSession["source"],
  fileName: string,
) {
  await ensureSessionRoot();
  const id = createSessionId();
  const sessionDir = path.join(SESSION_ROOT, id);
  const createdAt = new Date().toISOString();

  await fs.mkdir(sessionDir, { recursive: true });

  return {
    id,
    fileName,
    sessionDir,
    sourcePath: sourceFilePath(sessionDir),
    resultPath: resultFilePath(sessionDir),
    createdAt,
    updatedAt: createdAt,
    source,
    width: 0,
    height: 0,
  } satisfies ImageSession;
}

export async function createSessionFromFile(inputPath: string) {
  const normalizedPath = normalizeInputPath(inputPath);
  const fileName =
    path.basename(normalizedPath, path.extname(normalizedPath)) || "image";
  const session = await createSessionBase("file", fileName);
  await convertImageFileToPng(normalizedPath, session.sourcePath);
  await fs.copyFile(session.sourcePath, session.resultPath);
  const dimensions = await getImageDimensions(session.resultPath);
  session.width = dimensions.width;
  session.height = dimensions.height;
  await writeSession(session);
  return session;
}

export async function createSessionFromClipboard() {
  const session = await createSessionBase("clipboard", "clipboard-image");
  await clipboardImageToPng(session.sourcePath);
  await fs.copyFile(session.sourcePath, session.resultPath);
  const dimensions = await getImageDimensions(session.resultPath);
  session.width = dimensions.width;
  session.height = dimensions.height;
  await writeSession(session);
  return session;
}

export async function readSession(sessionId: string) {
  const file = sessionFilePath(path.join(SESSION_ROOT, sessionId));
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw) as ImageSession;
  if (!parsed.sourcePath) {
    parsed.sourcePath = parsed.resultPath;
  }
  return parsed;
}

export async function touchSession(sessionId: string) {
  const session = await readSession(sessionId);
  const next = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await writeSession(next);
  return next;
}

export async function writeSessionResult(sessionId: string, content: Buffer) {
  const session = await readSession(sessionId);
  await fs.writeFile(session.resultPath, content);
  return touchSession(sessionId);
}

export function isValidSessionId(value: string) {
  return /^[a-z0-9-]+$/i.test(value);
}
