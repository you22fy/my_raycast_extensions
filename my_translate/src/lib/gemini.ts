import { MODEL, buildPrompt, type TargetLang } from "./prompt";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const FENCE_RE = /^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/;

export function stripCodeFence(text: string): string {
  const m = text.match(FENCE_RE);
  return m ? m[1] : text;
}

export async function translate(
  text: string,
  target: TargetLang,
  apiKey: string,
): Promise<string> {
  const url = `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: buildPrompt(text, target) }] }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const json = (await res.json()) as GeminiResponse;

  if (json.error?.message) {
    throw new Error(`Gemini API error: ${json.error.message}`);
  }

  const out =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";
  if (!out) {
    const reason =
      json.promptFeedback?.blockReason ??
      json.candidates?.[0]?.finishReason ??
      "empty";
    return `(blocked or empty response: ${reason})`;
  }

  return stripCodeFence(out).trim();
}
