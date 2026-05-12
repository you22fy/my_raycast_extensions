import type { TargetLang } from "./prompt";

const JP_RE = /[぀-ヿ一-鿿]/;

export function detectTarget(text: string): TargetLang {
  return JP_RE.test(text) ? "en" : "ja";
}
