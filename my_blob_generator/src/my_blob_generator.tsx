import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Detail,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useEffect, useState } from "react";
import { BlobResult, generateBlob } from "./lib/blob";
import {
  INITIAL_COLORS,
  SavedColor,
  loadColors,
  normalizeHex,
  saveColors,
} from "./lib/colors";
import {
  cleanupGeneratedFiles,
  renderSvgToPng,
  savePng,
  saveSvg,
} from "./lib/files";

/* eslint-disable @raycast/prefer-title-case -- 日本語UI内のPNG/SVG表記を維持する */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

function colorIcon(hex: string) {
  return { source: Icon.Circle, tintColor: hex };
}

function timestampedName(extension: "png" | "svg") {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ];
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `blob-${parts.join("")}-${time}.${extension}`;
}

type PreviewProps = {
  initialResult: BlobResult;
  initialPngPath: string;
};

function BlobPreview({ initialResult, initialPngPath }: PreviewProps) {
  const [result, setResult] = useState(initialResult);
  const [pngPath, setPngPath] = useState(initialPngPath);
  const [isLoading, setIsLoading] = useState(false);
  const imageUri = encodeURI(`file://${pngPath}`);

  async function regenerate() {
    setIsLoading(true);
    try {
      const seed = randomUUID();
      const nextResult = generateBlob({ ...result, seed });
      const nextPngPath = await renderSvgToPng(nextResult.svg, seed);
      setResult(nextResult);
      setPngPath(nextPngPath);
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "blobを再生成できませんでした",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function copyPng() {
    await Clipboard.copy({ file: pngPath });
    await showToast({
      style: Toast.Style.Success,
      title: "PNG画像をコピーしました",
    });
  }

  async function copySvg() {
    await Clipboard.copy(result.svg);
    await showToast({
      style: Toast.Style.Success,
      title: "SVGコードをコピーしました",
    });
  }

  async function handleSavePng() {
    setIsLoading(true);
    try {
      const savedPath = await savePng(pngPath, timestampedName("png"));
      if (savedPath) {
        await showToast({
          style: Toast.Style.Success,
          title: "PNGを保存しました",
          message: savedPath,
        });
      }
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "PNGを保存できませんでした",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveSvg() {
    setIsLoading(true);
    try {
      const savedPath = await saveSvg(result.svg, timestampedName("svg"));
      if (savedPath) {
        await showToast({
          style: Toast.Style.Success,
          title: "SVGを保存しました",
          message: savedPath,
        });
      }
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "SVGを保存できませんでした",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle="生成したblob"
      markdown={`![Generated blob](${imageUri})`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Edges"
            text={String(result.edgesLevel)}
          />
          <Detail.Metadata.Label
            title="輪郭点"
            text={String(result.pointCount)}
          />
          <Detail.Metadata.Label
            title="Smoothness"
            text={String(result.smoothnessLevel)}
          />
          <Detail.Metadata.Label
            title="Color"
            text={result.color}
            icon={colorIcon(result.color)}
          />
          <Detail.Metadata.Label title="Size" text="1024 × 1024" />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="PNG画像をコピー"
            icon={Icon.Clipboard}
            onAction={copyPng}
          />
          <Action
            title="SVGコードをコピー"
            icon={Icon.Code}
            onAction={copySvg}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
          <ActionPanel.Section title="保存">
            <Action
              title="PNGとして保存"
              icon={Icon.Download}
              onAction={handleSavePng}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
            />
            <Action
              title="SVGとして保存"
              icon={Icon.Download}
              onAction={handleSaveSvg}
              shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="同じ設定で再生成"
              icon={Icon.Repeat}
              onAction={regenerate}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

type ColorEditorProps = {
  color?: SavedColor;
  onSave: (color: SavedColor) => Promise<void>;
};

function ColorEditor({ color, onSave }: ColorEditorProps) {
  const { pop } = useNavigation();
  const [name, setName] = useState(color?.name ?? "");
  const [hex, setHex] = useState(color?.hex ?? "");
  const [nameError, setNameError] = useState<string>();
  const [hexError, setHexError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  async function submit() {
    const normalizedName = name.trim();
    const normalizedHex = normalizeHex(hex);
    setNameError(normalizedName ? undefined : "名前を入力してください");
    setHexError(normalizedHex ? undefined : "#RRGGBB形式で入力してください");
    if (!normalizedName || !normalizedHex) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({
        id: color?.id ?? randomUUID(),
        name: normalizedName,
        hex: normalizedHex,
      });
      pop();
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "カラーを保存できませんでした",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={color ? "カラーを編集" : "カラーを追加"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={color ? "変更を保存" : "カラーを追加"}
            icon={Icon.CheckCircle}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="名前"
        placeholder="Brand Purple"
        value={name}
        error={nameError}
        onChange={(value) => {
          setName(value);
          setNameError(undefined);
        }}
      />
      <Form.TextField
        id="hex"
        title="HEX"
        placeholder="#7C3AED"
        value={hex}
        error={hexError}
        onChange={(value) => {
          setHex(value);
          setHexError(undefined);
        }}
      />
      <Form.Description text="3桁または6桁のHEXカラーを入力できます。保存時に #RRGGBB へ正規化します。" />
    </Form>
  );
}

type ColorManagerProps = {
  initialColors: SavedColor[];
  onChange: (colors: SavedColor[]) => void;
};

function ColorManager({ initialColors, onChange }: ColorManagerProps) {
  const [colors, setColors] = useState(initialColors);

  async function persist(nextColors: SavedColor[]) {
    await saveColors(nextColors);
    setColors(nextColors);
    onChange(nextColors);
  }

  async function upsertColor(nextColor: SavedColor) {
    const existingIndex = colors.findIndex((item) => item.id === nextColor.id);
    const nextColors = [...colors];
    if (existingIndex === -1) {
      nextColors.push(nextColor);
    } else {
      nextColors[existingIndex] = nextColor;
    }
    await persist(nextColors);
  }

  async function deleteColor(color: SavedColor) {
    const confirmed = await confirmAlert({
      title: `「${color.name}」を削除しますか？`,
      message: "保存パレットから削除されます。",
      primaryAction: {
        title: "削除",
        style: Alert.ActionStyle.Destructive,
      },
    });
    if (!confirmed) {
      return;
    }

    try {
      await persist(colors.filter((item) => item.id !== color.id));
      await showToast({
        style: Toast.Style.Success,
        title: "カラーを削除しました",
      });
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "カラーを削除できませんでした",
      });
    }
  }

  return (
    <List navigationTitle="保存カラー">
      {colors.length === 0 ? (
        <List.EmptyView
          icon={Icon.Circle}
          title="保存カラーがありません"
          description="アクションからカラーを追加してください"
          actions={
            <ActionPanel>
              <Action.Push
                title="カラーを追加"
                icon={Icon.Plus}
                target={<ColorEditor onSave={upsertColor} />}
              />
            </ActionPanel>
          }
        />
      ) : (
        colors.map((color) => (
          <List.Item
            key={color.id}
            title={color.name}
            subtitle={color.hex}
            icon={colorIcon(color.hex)}
            actions={
              <ActionPanel>
                <Action.Push
                  title="カラーを編集"
                  icon={Icon.Pencil}
                  target={<ColorEditor color={color} onSave={upsertColor} />}
                />
                <Action.Push
                  title="カラーを追加"
                  icon={Icon.Plus}
                  target={<ColorEditor onSave={upsertColor} />}
                />
                <Action
                  title="カラーを削除"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => deleteColor(color)}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

export default function MyBlobGenerator() {
  const { push } = useNavigation();
  const [colors, setColors] = useState<SavedColor[]>([]);
  const [selectedColorId, setSelectedColorId] = useState("");
  const [edgesLevel, setEdgesLevel] = useState("5");
  const [smoothnessLevel, setSmoothnessLevel] = useState("7");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadColors(), cleanupGeneratedFiles()])
      .then(([storedColors]) => {
        if (cancelled) {
          return;
        }
        setColors(storedColors);
        setSelectedColorId(storedColors[0]?.id ?? "");
      })
      .catch(async (error) => {
        console.error(error);
        if (!cancelled) {
          setColors(INITIAL_COLORS);
          setSelectedColorId(INITIAL_COLORS[0].id);
          await showToast({
            style: Toast.Style.Failure,
            title: "保存カラーを読み込めませんでした",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleColorsChanged(nextColors: SavedColor[]) {
    setColors(nextColors);
    if (!nextColors.some((color) => color.id === selectedColorId)) {
      setSelectedColorId(nextColors[0]?.id ?? "");
    }
  }

  async function generate() {
    const color = colors.find((item) => item.id === selectedColorId);
    if (!color) {
      await showToast({
        style: Toast.Style.Failure,
        title: "カラーを追加してください",
      });
      return;
    }

    setIsLoading(true);
    try {
      const seed = randomUUID();
      const result = generateBlob({
        edgesLevel: Number(edgesLevel),
        smoothnessLevel: Number(smoothnessLevel),
        color: color.hex,
        seed,
      });
      const pngPath = await renderSvgToPng(result.svg, seed);
      push(<BlobPreview initialResult={result} initialPngPath={pngPath} />);
    } catch (error) {
      console.error(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "blobを生成できませんでした",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Blob Generator"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Blobを生成"
            icon={Icon.Wand}
            onSubmit={generate}
          />
          <Action.Push
            title="保存カラーを管理"
            icon={Icon.Swatch}
            target={
              <ColorManager
                initialColors={colors}
                onChange={handleColorsChanged}
              />
            }
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="edges"
        title="Edges"
        value={edgesLevel}
        onChange={setEdgesLevel}
      >
        {LEVELS.map((level) => (
          <Form.Dropdown.Item
            key={level}
            value={String(level)}
            title={`${level}（輪郭点 ${level + 2}）`}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="smoothness"
        title="Smoothness"
        value={smoothnessLevel}
        onChange={setSmoothnessLevel}
      >
        {LEVELS.map((level) => (
          <Form.Dropdown.Item
            key={level}
            value={String(level)}
            title={String(level)}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="color"
        title="Color"
        value={selectedColorId}
        onChange={setSelectedColorId}
      >
        {colors.map((color) => (
          <Form.Dropdown.Item
            key={color.id}
            value={color.id}
            title={`${color.name}  ${color.hex}`}
            icon={colorIcon(color.hex)}
          />
        ))}
      </Form.Dropdown>
      <Form.Description text="透明背景の1024 × 1024 PNGと、拡縮可能なSVGを生成します。" />
    </Form>
  );
}
