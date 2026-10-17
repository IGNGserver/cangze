#!/usr/bin/env bash
# 把构建副本里生成、需要入库的文件（锁文件、openapi.json、格式化结果）拷回 worktree。
# 用法：
#   scripts/scratch-pull.sh pnpm-lock.yaml docs/openapi.json   # 指定文件
#   scripts/scratch-pull.sh --existing                          # 回写 worktree 中已存在且内容不同的文件（如 prettier --write 之后）
set -euo pipefail

src="$(git rev-parse --show-toplevel)"
slug="$(basename "$src")"
dest="${BUILD_SCRATCH_ROOT:-$HOME/.build}/cangze/$slug"

if [ "${1:-}" = "--existing" ]; then
  # --inplace：NAS 卷上整文件重写走原地 O_TRUNC，不用临时文件 + rename（设备级规范第 8 节）
  rsync -a --checksum --existing --inplace --itemize-changes \
    --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude 'coverage' \
    "$dest/" "$src/"
  exit 0
fi

for rel in "$@"; do
  case "$rel" in
    *node_modules*|*dist/*) echo "拒绝拷回构建产物：$rel" >&2; exit 1 ;;
  esac
  mkdir -p "$(dirname "$src/$rel")"
  cat "$dest/$rel" > "$src/$rel"
  echo "pulled $rel"
done
