import {
  LaunchType,
  Toast,
  getSelectedText,
  launchCommand,
  showToast,
} from "@raycast/api";

export default async function TranslateSelection() {
  let text: string;
  try {
    text = await getSelectedText();
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: "翻訳対象のテキストが選択されていません",
    });
    return;
  }

  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    await showToast({
      style: Toast.Style.Failure,
      title: "翻訳対象のテキストが選択されていません",
    });
    return;
  }

  await launchCommand({
    name: "my_translate",
    type: LaunchType.UserInitiated,
    context: { text: trimmed, target: "ja" },
  });
}
