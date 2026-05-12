import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  Toast,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { translate } from "../lib/gemini";
import type { TargetLang } from "../lib/prompt";

type Prefs = { geminiApiKey: string };

type Props = {
  original: string;
  target: TargetLang;
};

const TARGET_LABEL: Record<TargetLang, string> = {
  ja: "日本語",
  en: "English",
};

export function ResultDetail({ original, target }: Props) {
  const { geminiApiKey } = getPreferenceValues<Prefs>();
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [nonce, setNonce] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setResult("");

    (async () => {
      try {
        const out = await translate(original, target, geminiApiKey);
        if (!cancelled) setResult(out);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setResult(`# 翻訳エラー\n\n\`\`\`\n${msg}\n\`\`\``);
          await showToast({
            style: Toast.Style.Failure,
            title: "翻訳に失敗しました",
            message: msg,
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [original, target, geminiApiKey, nonce]);

  const markdown = result || "翻訳中...";

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={`Translate → ${TARGET_LABEL[target]}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="翻訳先" text={TARGET_LABEL[target]} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="原文 (先頭)"
            text={original.slice(0, 80) + (original.length > 80 ? "…" : "")}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="翻訳結果をコピー"
            content={result}
            icon={Icon.Clipboard}
          />
          <Action.CopyToClipboard
            title="原文をコピー"
            content={original}
            icon={Icon.CopyClipboard}
          />
          <Action
            title="再翻訳"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => setNonce((n) => n + 1)}
          />
        </ActionPanel>
      }
    />
  );
}
