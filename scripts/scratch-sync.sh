#!/usr/bin/env bash
# 把当前 worktree 的源码同步到本机盘构建区（设备级规范第 5c 节）。
# 依赖安装、测试、构建只在同步副本里跑；worktree（NAS 卷）里不得出现 node_modules/dist。
set -euo pipefail

src="$(git rev-parse --show-toplevel)"
slug="$(basename "$src")"
root="${BUILD_SCRATCH_ROOT:-$HOME/.build}"
dest="$root/cangze/$slug"

case "$dest" in
  /tmp/*|/private/tmp/*|"${TMPDIR:-/nonexistent}"*) echo "拒绝：构建区不能在 /tmp 或 \$TMPDIR（$dest）" >&2; exit 1 ;;
esac

mkdir -p "$dest"
# P 规则：副本里新生成、尚未拷回 worktree 的锁文件与 openapi.json 不被 --delete 删掉
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude 'coverage' \
  --exclude 'test-results' --exclude 'playwright-report' --exclude '/data' \
  --exclude '/pnpm-lock.yaml' --filter 'P /pnpm-lock.yaml' --filter 'P /docs/openapi.json' --filter 'P /.devdata' \
  "$src/" "$dest/"
# 锁文件只在 worktree 版本更新时才覆盖副本：副本里刚 `pnpm install` 生成的新锁文件要先拷回 worktree，不能被旧版本盖掉
rsync -a --update "$src/pnpm-lock.yaml" "$dest/pnpm-lock.yaml"
echo "$dest"
