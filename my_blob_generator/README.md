# Blob Generator

Edges、Smoothness、カラーを指定してblob画像を生成するRaycast拡張です。

## 機能

- EdgesとSmoothnessをそれぞれ10段階で指定
- 名前付きカラーパレットの追加・編集・削除
- 生成結果のプレビューと再生成
- 1024×1024の透過PNGをコピーまたは保存
- SVGマークアップをコピー、またはSVGファイルとして保存

PNGへの変換にはmacOS標準のAppKitを使用します。Xcode Command Line Toolsが必要です。

## 開発

```sh
npm install
npm run dev
```

静的検査とビルドは以下で実行できます。

```sh
npm run lint
npm run build
```
