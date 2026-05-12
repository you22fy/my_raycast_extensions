import {
  Detail,
  Toast,
  getSelectedText,
  popToRoot,
  showToast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { ResultDetail } from "./components/ResultDetail";

export default function TranslateSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const text = await getSelectedText();
        const trimmed = text?.trim() ?? "";
        if (!trimmed) {
          await showToast({
            style: Toast.Style.Failure,
            title: "翻訳対象のテキストが選択されていません",
          });
          await popToRoot();
          return;
        }
        setSelected(text);
      } catch {
        await showToast({
          style: Toast.Style.Failure,
          title: "翻訳対象のテキストが選択されていません",
        });
        await popToRoot();
        setBootError("no-selection");
      }
    })();
  }, []);

  if (bootError) {
    return <Detail markdown="" />;
  }

  if (selected == null) {
    return <Detail isLoading markdown="選択テキストを取得中..." />;
  }

  return <ResultDetail original={selected} target="ja" />;
}
