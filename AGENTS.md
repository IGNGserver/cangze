# 藏泽（Cangze）· 项目 Agent 规范

> 只写本仓库与设备级规范的差异。Git 纪律、worktree、冲突处理、构建去处见 `~/.qoder/coder-rules/global-rules.md`。
> 本文件是本仓库唯一的 Agent 规范来源；`CLAUDE.md` 只是 `@AGENTS.md` 的兼容垫片，不要往里写内容。

Collaboration: solo
Baseline: main
Default branch: main
Release: tag + Actions（`.github/workflows/release.yml`，推 `v*.*.*` tag 触发；未说明时一律 prerelease）
Validation: `pnpm verify`（在 `$BUILD_SCRATCH_ROOT/cangze/<slug>` 的同步副本里跑）；镜像构建、`docker compose config`、e2e 由 PR 上的 CI 承担
Worktree: `~/项目/.wt/智能家庭中枢/<slug>`

## 这是什么

藏泽是面向普通用户的开源 AI 智能家居中枢：Docker Compose 单容器部署，通过 WebSocket/REST 连接用户已有的
Home Assistant（不内置 HA、不依赖 HA 插件），以 Pi Agent（`@earendil-works/pi-agent-core` + `pi-ai`）为引擎，
提供多个平等的主 Session 与全局共享的持久化子代理。架构总览见 `docs/ARCHITECTURE.md`，关键决策见 `docs/adr/`。

## 工程结构

- `apps/server`：Fastify 5 + SQLite（better-sqlite3 + Drizzle），按 `src/modules/<模块>` 划分。
- `apps/web`：React 19 + Vite + antd 6 + @ant-design/x 2.x，Fluent 2 风格主题。
- `packages/contracts`：前后端共用的 zod 模型与 WS 事件协议；OpenAPI 由它生成并提交在 `docs/openapi.json`。

## 开发去处（第 5c / 8 节的落地方式）

源码只在 worktree（NAS 卷）里改；依赖安装、测试、构建只在本机盘的同步副本里跑：

```bash
scripts/scratch-sync.sh            # rsync worktree → $BUILD_SCRATCH_ROOT/cangze/<slug>（排除 .git/node_modules/dist）
cd "$BUILD_SCRATCH_ROOT/cangze/<slug>" && pnpm install && pnpm verify
```

- **不得**在 worktree 里执行 `pnpm install`、`pnpm build`、`vite`；worktree 里出现 `node_modules/`、`dist/` 属于事故。
- 生成物需要入库时（`docs/openapi.json`、`pnpm-lock.yaml`、迁移 SQL），在副本里生成后用 `scripts/scratch-pull.sh <相对路径>` 拷回 worktree，再在 worktree 里提交。
- 本机没有 docker：镜像与 compose 校验看 CI 的 `image` job。

## 不可破坏的架构不变量

1. **每一次对 HA 的写操作都必须经过 `HaGateway` 并携带 `Principal`**；Gateway 内部再次调用 `PolicyEngine`，工具层的
   `beforeToolCall` 只是第一道检查。新增任何写 HA 的路径都不得绕过 Gateway。
2. `call_service` 的 area/device/floor/label 目标必须在鉴权前展开为实体集合，鉴权通过后以显式 `entity_id` 发往 HA。
3. 子代理权限默认拒绝；子代理不得创建子代理、不得修改自身定义或权限。
4. 子代理定义只追加修订（`agent_revisions`），更新必须带 `baseRevision` 做乐观并发控制。
5. 凭据（LLM key、HA token）只以 AES-256-GCM 密文落库；日志、审计、错误信息里不得出现明文。
6. 数据库迁移只追加（`apps/server/src/db/migrations/NNNN_*.ts`，导出 SQL 文本），不得修改已发布的迁移。
7. 所有 Web 功能只通过 `/api/v1` 与 `/api/v1/stream` 提供，不得为 Web 开私有接口（Android 客户端将复用同一套接口）。
8. 界面文案必须同时提供 `zh-CN` 与 `en`（`apps/web/src/i18n/locales/*`），`pnpm verify` 会检查键一致。

## 版本与发布

- 根 `VERSION` 是唯一版本源，`package.json`（根与各 workspace）必须一致：`pnpm verify:version`。
- “发布 release”= prerelease；只有明确“发布正式版”才打正式 Release 并更新镜像 `latest`。
- 镜像：`ghcr.io/igngserver/cangze:<version>`，linux/amd64 + linux/arm64。

## 文档

- README 只有 `README.md`（英文）与 `README.zh-CN.md`（简中）；`docs/` 下其余文档用英文。
- 改动架构约定、接口或权限模型时，先更新 `docs/ARCHITECTURE.md` / `docs/PERMISSIONS.md` / `docs/API.md`，再改代码。
