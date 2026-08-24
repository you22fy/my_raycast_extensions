import { LocalStorage } from "@raycast/api";

export type SavedColor = {
  id: string;
  name: string;
  hex: string;
};

const STORAGE_KEY = "blob-colors-v1";

export const INITIAL_COLORS: SavedColor[] = [
  { id: "purple", name: "Purple", hex: "#7C3AED" },
  { id: "blue", name: "Blue", hex: "#2563EB" },
  { id: "green", name: "Green", hex: "#16A34A" },
  { id: "orange", name: "Orange", hex: "#EA580C" },
  { id: "pink", name: "Pink", hex: "#EC4899" },
];

export function normalizeHex(value: string) {
  const trimmed = value.trim();
  const shortMatch = trimmed.match(/^#?([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`.toUpperCase();
  }

  const fullMatch = trimmed.match(/^#?([0-9a-f]{6})$/i);
  if (fullMatch) {
    return `#${fullMatch[1].toUpperCase()}`;
  }

  return null;
}

function isSavedColor(value: unknown): value is SavedColor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SavedColor>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.hex === "string" &&
    normalizeHex(candidate.hex) !== null
  );
}

export async function loadColors() {
  const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!stored) {
    await saveColors(INITIAL_COLORS);
    return INITIAL_COLORS;
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isSavedColor)) {
      throw new Error("Invalid color palette");
    }
    return parsed.map((color) => ({ ...color, hex: normalizeHex(color.hex)! }));
  } catch {
    await saveColors(INITIAL_COLORS);
    return INITIAL_COLORS;
  }
}

export async function saveColors(colors: SavedColor[]) {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}
