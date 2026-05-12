#!/usr/bin/env bash
# my_raycast_extensions/install.sh
#
# 配下の Raycast 拡張 (package.json に @raycast/api を含むディレクトリ) を
# 一覧表示して選択し、`npm install` + `npm run dev` を実行する CLI。
# `ray develop` が起動して Raycast にエクステンションが登録されたら Ctrl+C で停止する。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# --- 1. インストール候補を検出 -----------------------------------------------
candidates=()
for d in */; do
  d="${d%/}"
  [[ -f "$d/package.json" ]] || continue
  if grep -q '"@raycast/api"' "$d/package.json" 2>/dev/null; then
    candidates+=("$d")
  fi
done

if [[ ${#candidates[@]} -eq 0 ]]; then
  echo "Raycast 拡張が見つかりませんでした (package.json に \"@raycast/api\" が必要)" >&2
  exit 1
fi

# --- 2. メニュー表示 ---------------------------------------------------------
echo "============================================================"
echo "  my_raycast_extensions installer"
echo "============================================================"
echo
echo "インストール可能な拡張:"
for i in "${!candidates[@]}"; do
  printf "  [%d] %s\n" "$((i + 1))" "${candidates[$i]}"
done
echo "  [a] すべて"
echo "  [q] 中止"
echo

read -rp "選択 (番号をスペース区切りで複数可): " input

# --- 3. 選択をパース ---------------------------------------------------------
selected=()
case "$input" in
  ""|q|Q|quit|exit)
    echo "中止しました"
    exit 0
    ;;
  a|A|all)
    selected=("${candidates[@]}")
    ;;
  *)
    for p in $input; do
      if [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1 && p <= ${#candidates[@]} )); then
        selected+=("${candidates[$((p - 1))]}")
      else
        echo "無効な番号: $p" >&2
        exit 1
      fi
    done
    ;;
esac

if [[ ${#selected[@]} -eq 0 ]]; then
  echo "選択がありません" >&2
  exit 1
fi

# --- 4. 各拡張に対してインストール -------------------------------------------
trap 'echo; echo "中断されました"; exit 130' INT

for ext in "${selected[@]}"; do
  echo
  echo "------------------------------------------------------------"
  echo "  ${ext}"
  echo "------------------------------------------------------------"
  (
    cd "$ext"
    echo "[1/2] npm install"
    npm install --no-audit --no-fund

    echo
    echo "[2/2] npm run dev  (Raycast にロードされたら Ctrl+C で停止してください)"
    # ray develop は常駐するので、Ctrl+C で抜けても次の拡張に進めるよう
    # 終了コードは無視する。
    npm run dev || true
  )
done

echo
echo "完了しました。Raycast を開いて動作確認してください。"
