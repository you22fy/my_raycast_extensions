import { existsSync } from "node:fs";
import path from "node:path";

function hasPackageJson(dir: string) {
  return existsSync(path.join(dir, "package.json"));
}

export function getExtensionRoot() {
  let current = __dirname;

  for (let index = 0; index < 6; index += 1) {
    if (hasPackageJson(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error("Could not locate extension root");
}

export function getAssetPath(...segments: string[]) {
  return path.join(getExtensionRoot(), "assets", ...segments);
}
