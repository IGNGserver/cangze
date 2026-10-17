# 藏泽（Cangze）· 项目 Agent 规范

> 只写本仓库与设备级规范的差异。Git 纪律、worktree、冲突处理见 `~/.qoder/coder-rules/global-rules.md`。

Collaboration: solo
Baseline: main
Default branch: main
Release: manual
Validation: `docker compose config`
Worktree: `~/项目/.wt/智能家庭中枢/<slug>`

## 这是什么

藏泽（Cangze）是一套由 Docker Compose 部署的智能家居控制中枢：
- **Web 端**：提供家庭中枢管理控制台；
- **大模型接入**：支持配置 API 密钥连接大语言模型（LLM）；
- **设备控制**：由大语言模型理解用户意图并驱动控制 Home Assistant，完成智能家居操作与自动化联动。

## 仓库布局与开发纪律

- 仓库主目录已按全局规范 1c 冻结为无代码锚点（`_anchor`），仅保留 `AGENTS.md`。
- 所有开发任务必须通过 `wt new 智能家庭中枢 <slug>` 在 `~/项目/.wt/智能家庭中枢/<slug>` 进行。
- 任务完成后提交并推送到远端 PR，测试通过后按 solo 模式集成，收尾执行 `wt done 智能家庭中枢 <slug>`。
- 构建产物与依赖目录一律不得落在项目卷上（遵循设备级规范第 5c 与第 8 节）。
