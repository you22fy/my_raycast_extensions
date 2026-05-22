import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  LocalStorage,
  Toast,
  showToast,
} from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { useEffect, useState } from "react";
import { editImageWithMouse } from "./lib/image";
import {
  cleanupOldSessions,
  createSessionFromClipboard,
  createSessionFromFile,
  readSession,
  touchSession,
} from "./lib/session";
import type { ImageSession } from "./lib/session";
import { savePngToChosenLocation } from "./lib/save";

type FileFormValues = {
  image: string[];
};

type LaunchContext = {
  sessionId?: string;
};

const COMPLETED_SESSION_KEY = "completedSessionId";
const execFileAsync = promisify(execFile);

function createCommandDeeplink(context: LaunchContext) {
  const encodedContext = encodeURIComponent(JSON.stringify(context));
  return `raycast://extensions/you22fy/my-image-editor/my_image_editor?launchType=userInitiated&context=${encodedContext}`;
}

export default function MyImageEditor(
  props: LaunchProps<{ launchContext: LaunchContext }>,
) {
  const [session, setSession] = useState<ImageSession | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    void cleanupOldSessions().catch((error) => {
      console.error(error);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sessionId = props.launchContext?.sessionId;

    void (async () => {
      const targetSessionId =
        sessionId ??
        (await LocalStorage.getItem<string>(COMPLETED_SESSION_KEY));

      if (!targetSessionId) {
        return;
      }

      try {
        const next = await readSession(targetSessionId);
        if (!cancelled) {
          setSession(next);
        }
      } catch {
        if (!sessionId) {
          await LocalStorage.removeItem(COMPLETED_SESSION_KEY);
        }
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.launchContext?.sessionId]);

  async function storeSession(next: ImageSession) {
    setSession(next);
  }

  async function discardCompletedSession() {
    await LocalStorage.removeItem(COMPLETED_SESSION_KEY);
  }

  async function rememberCompletedSession(next: ImageSession) {
    await LocalStorage.setItem(COMPLETED_SESSION_KEY, next.id);
  }

  async function reopenRaycastSession(sessionId: string) {
    await execFileAsync("/usr/bin/open", [
      createCommandDeeplink({ sessionId }),
    ]).catch(() => undefined);
    await execFileAsync("/usr/bin/open", ["-a", "Raycast"]).catch(
      () => undefined,
    );
  }

  async function loadFromClipboard() {
    setIsBusy(true);
    try {
      await discardCompletedSession();
      const next = await createSessionFromClipboard();
      await storeSession(next);
      await showToast({
        style: Toast.Style.Success,
        title: "クリップボード画像を読み込みました",
      });
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "クリップボードから画像を読み込めませんでした",
        message: "画像が入っているか確認してください",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function loadFromFile(values: FileFormValues) {
    const inputPath = values.image[0];
    if (!inputPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "画像ファイルを選択してください",
      });
      return;
    }

    setIsBusy(true);
    try {
      await discardCompletedSession();
      const next = await createSessionFromFile(inputPath);
      await storeSession(next);
      await showToast({
        style: Toast.Style.Success,
        title: "画像を読み込みました",
      });
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "画像ファイルを読み込めませんでした",
        message: "PNG, JPEG など一般的な画像ファイルを選択してください",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleMouseEdit() {
    if (!session) {
      return;
    }

    setIsBusy(true);
    try {
      const didApply = await editImageWithMouse(
        session.resultPath,
        session.resultPath,
      );
      if (didApply) {
        const next = await touchSession(session.id);
        await storeSession(next);
        await rememberCompletedSession(next);
        await reopenRaycastSession(next.id);
      }
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "マウス編集を開けませんでした",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCopy() {
    if (!session) {
      return;
    }

    await Clipboard.copy({ file: session.resultPath });
    await showToast({
      style: Toast.Style.Success,
      title: "加工済み画像をコピーしました",
    });
  }

  async function handleSave() {
    if (!session) {
      return;
    }

    setIsBusy(true);
    try {
      const savedPath = await savePngToChosenLocation(
        session.resultPath,
        `${session.fileName}-edited`,
      );
      if (savedPath) {
        await showToast({
          style: Toast.Style.Success,
          title: "画像を保存しました",
          message: savedPath,
        });
      }
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "画像を保存できませんでした",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReload() {
    if (!session) {
      return;
    }
    await storeSession(await readSession(session.id));
  }

  if (!session) {
    return (
      <Form
        isLoading={isBusy}
        navigationTitle="画像エディタ"
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="選択した画像を読み込む"
              icon={Icon.Image}
              onSubmit={loadFromFile}
            />
            <Action
              title="クリップボードから読み込む"
              icon={Icon.Clipboard}
              onAction={loadFromClipboard}
              shortcut={{ modifiers: ["cmd"], key: "v" }}
            />
          </ActionPanel>
        }
      >
        <Form.Description text="画像を読み込んだ後、マウス操作の編集ウィンドウを開けます。" />
        <Form.FilePicker
          id="image"
          title="画像ファイル"
          allowMultipleSelection={false}
          value={selectedFiles}
          onChange={setSelectedFiles}
        />
      </Form>
    );
  }

  return (
    <List
      isLoading={isBusy}
      navigationTitle="画像エディタ"
      searchBarPlaceholder="操作を選択"
    >
      <List.Item
        id="edit"
        title="マウスで編集"
        subtitle="塗りつぶし矩形・枠線矩形・ボカシ"
        icon={Icon.Pencil}
        accessories={[{ text: "return" }]}
        actions={<MenuActions primary="edit" />}
      />
      <List.Item
        id="save"
        title="画像ファイルに保存"
        subtitle={`${session.fileName}-edited.png`}
        icon={Icon.Download}
        accessories={[{ text: "cmd + return" }]}
        actions={<MenuActions primary="save" />}
      />
      <List.Item
        id="copy"
        title="クリップボードにコピー"
        subtitle="加工済みPNGをコピー"
        icon={Icon.Clipboard}
        accessories={[{ text: "cmd + c" }]}
        actions={<MenuActions primary="copy" />}
      />
      <List.Item
        id="clear"
        title="現在の画像を破棄して最初から"
        subtitle="保存前の編集結果を消します"
        icon={Icon.Trash}
        accessories={[{ text: "cmd + n" }]}
        actions={<MenuActions primary="clear" />}
      />
      <List.Item
        id="clipboard"
        title="現在の画像を破棄してクリップボードから読み込み"
        subtitle="新しい画像で開始"
        icon={Icon.Clipboard}
        actions={<MenuActions primary="clipboard" />}
      />
      <List.Item
        id="info"
        title="現在の画像"
        subtitle={`${session.width} x ${session.height} / ${new Date(session.updatedAt).toLocaleString()}`}
        icon={Icon.Info}
        actions={<MenuActions primary="edit" />}
      />
    </List>
  );

  function MenuActions({
    primary,
  }: {
    primary: "edit" | "save" | "copy" | "clear" | "clipboard";
  }) {
    const primaryAction =
      primary === "edit" ? (
        <Action
          title="マウスで編集"
          icon={Icon.Pencil}
          onAction={handleMouseEdit}
        />
      ) : primary === "save" ? (
        <Action
          title="画像ファイルに保存"
          icon={Icon.Download}
          onAction={handleSave}
          shortcut={{ modifiers: ["cmd"], key: "return" }}
        />
      ) : primary === "copy" ? (
        <Action
          title="クリップボードにコピー"
          icon={Icon.Clipboard}
          onAction={handleCopy}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
        />
      ) : primary === "clipboard" ? (
        <Action
          title="現在の画像を破棄してクリップボードから読み込み"
          icon={Icon.Clipboard}
          onAction={loadFromClipboard}
        />
      ) : (
        <Action
          title="現在の画像を破棄して最初から"
          icon={Icon.Trash}
          onAction={() => {
            setSession(null);
            setSelectedFiles([]);
            void discardCompletedSession();
          }}
          shortcut={Keyboard.Shortcut.Common.New}
        />
      );

    return (
      <ActionPanel>
        {primaryAction}
        {primary !== "edit" ? (
          <Action
            title="マウスで編集"
            icon={Icon.Pencil}
            onAction={handleMouseEdit}
          />
        ) : null}
        {primary !== "save" ? (
          <Action
            title="画像ファイルに保存"
            icon={Icon.Download}
            onAction={handleSave}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
          />
        ) : null}
        {primary !== "copy" ? (
          <Action
            title="クリップボードにコピー"
            icon={Icon.Clipboard}
            onAction={handleCopy}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        ) : null}
        <Action
          title="表示を更新"
          icon={Icon.ArrowClockwise}
          onAction={handleReload}
          shortcut={Keyboard.Shortcut.Common.Refresh}
        />
        <ActionPanel.Section title="リセット">
          {primary !== "clipboard" ? (
            <Action
              title="現在の画像を破棄してクリップボードから読み込み"
              icon={Icon.Clipboard}
              onAction={loadFromClipboard}
            />
          ) : null}
          {primary !== "clear" ? (
            <Action
              title="現在の画像を破棄して最初から"
              icon={Icon.Trash}
              onAction={() => {
                setSession(null);
                setSelectedFiles([]);
                void discardCompletedSession();
              }}
              shortcut={Keyboard.Shortcut.Common.New}
            />
          ) : null}
        </ActionPanel.Section>
      </ActionPanel>
    );
  }
}
