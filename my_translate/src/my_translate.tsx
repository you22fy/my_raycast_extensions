import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LaunchProps,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { ResultDetail } from "./components/ResultDetail";
import { detectTarget } from "./lib/detect";
import type { TargetLang } from "./lib/prompt";

type Context = { text?: string; target?: TargetLang };
type Values = { text: string };

export default function MyTranslate(
  props: LaunchProps<{ launchContext: Context }>,
) {
  const ctxText = props.launchContext?.text?.trim() ?? "";
  if (ctxText) {
    const ctxTarget: TargetLang = props.launchContext?.target ?? "ja";
    return <ResultDetail original={ctxText} target={ctxTarget} />;
  }
  return <TranslateForm />;
}

function TranslateForm() {
  const { push } = useNavigation();
  const [text, setText] = useState<string>("");

  async function handleSubmit({ text }: Values) {
    const trimmed = text.trim();
    if (!trimmed) {
      await showToast({
        style: Toast.Style.Failure,
        title: "テキストを入力してください",
      });
      return;
    }
    const target = detectTarget(trimmed);
    push(<ResultDetail original={trimmed} target={target} />);
  }

  const target = text.trim() ? detectTarget(text.trim()) : null;

  return (
    <Form
      navigationTitle="My Translate"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="翻訳"
            icon={Icon.Globe}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="日本語 ↔ 英語 を自動判定して翻訳します。他言語はサポートしていません。" />
      <Form.TextArea
        id="text"
        title="原文"
        placeholder="ここに翻訳したいテキストを入力"
        value={text}
        onChange={setText}
        enableMarkdown={false}
      />
      <Form.Description
        text={
          target == null
            ? "翻訳方向: (未入力)"
            : target === "ja"
              ? "翻訳方向: English → 日本語"
              : "翻訳方向: 日本語 → English"
        }
      />
    </Form>
  );
}
