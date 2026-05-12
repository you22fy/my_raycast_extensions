export const MODEL = "gemini-3.1-flash-lite";

export type TargetLang = "ja" | "en";

export function buildPrompt(text: string, target: TargetLang): string {
  const targetLabel = target === "ja" ? "日本語" : "英語 (English)";
  return `あなたはプロの翻訳者です。以下のテキストを${targetLabel}に翻訳してください。

翻訳ルール:
1. ソースコードを翻訳せずに **コメントのみ** を翻訳して、コードの体裁（インデント・記号・改行）はそのまま保つこと。
2. URL や識別子（変数名・関数名・ファイル名・APIキーなど）、英語であることに意味がある部分は翻訳しないこと。
3. スラング・口語は意味が伝わるように自然に訳すこと。

出力は翻訳結果のみを返し、前置き・後書き・コードフェンス（\`\`\`）は付けないでください。

---
${text}
---`;
}
