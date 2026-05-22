# my_raycast_extensions

自作の Raycast 拡張をまとめたリポジトリ。

## 拡張一覧

### my_translate

Gemini を使った翻訳拡張。コマンドは2種類。

- **Translate Selection**: 選択中のテキストを日本語に翻訳して通知する no-view コマンド
- **My Translate**: ウィンドウを開いて入力テキストを En ↔ Ja で自動翻訳する view コマンド

使用には Google AI Studio で発行する Gemini API Key を Raycast の Preferences に設定する必要あり。

### my_image_editor

画像にマウス操作で矩形・枠線・ボカシを追加して保存/コピーする拡張。クリップボードまたはファイルから画像を読み込み、編集後に保存またはクリップボードへ書き戻す。

描画処理は Swift スクリプト (`assets/swift/image-bridge.swift`) を `/usr/bin/swift` 経由で呼び出して実行している（AppKit / CoreImage 利用）。Xcode Command Line Tools が必要。

## セットアップ

リポジトリ直下の `install.sh` を実行すると、`@raycast/api` を含む拡張が一覧表示され、選択したものに対して `npm install` と `npm run dev` を実行する。

```sh
./install.sh
```

`ray develop` で Raycast に拡張がロードされたら Ctrl+C で停止。
