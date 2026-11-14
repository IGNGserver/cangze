# 托管与部署（Cloudflare Pages）

> 正式站点：<https://cangze.igng.net/>。站点源码位于产品主仓库 `IGNGserver/cangze` 的 `website/`，采用 Cloudflare Pages **Direct Upload** 托管，持续校验与自动发布工作流为 `.github/workflows/website.yml`。

## 当前配置

| 项         | 值                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------- |
| Pages 项目 | `cangze-website`（Direct Upload）                                                         |
| 部署来源   | `IGNGserver/cangze` 的 `website/`                                                         |
| 部署工作流 | `.github/workflows/website.yml`                                                           |
| 生产分支   | `main`                                                                                    |
| 构建命令   | `pnpm install --frozen-lockfile --ignore-workspace && pnpm run build`（在 `website/` 下） |
| 发布目录   | `website/dist/`                                                                           |
| 自定义域名 | `https://cangze.igng.net/`（zone `igng.net`）                                             |
| 默认别名   | `https://cangze-website.pages.dev/`（保留）                                               |
| DNS        | proxied CNAME `cangze.igng.net` → `cangze-website.pages.dev`                              |

`SITE_URL` 固定为 `https://cangze.igng.net/`，与 `website/index.html`（canonical、`og:url`、`og:image`、JSON-LD）、`website/public/robots.txt`、`website/public/sitemap.xml` 保持一致。`website/` 使用独立的 `package.json`、`pnpm-workspace.yaml` 与 `pnpm-lock.yaml`，不并入产品根目录的构建工作区。

## 构建参数与缓存头

| 项     | 值                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安装   | `pnpm install --frozen-lockfile --ignore-workspace`（Node.js ≥ 24，`packageManager: pnpm@10.33.0`）                                                                                                   |
| 构建   | `pnpm run build`（`tsc --noEmit && vite build`）                                                                                                                                                      |
| 验证   | `pnpm run verify`（静态产物与 SEO 元数据校验 + Playwright 无头 Chromium WebGL + 桌面/移动端交互验收）                                                                                                 |
| 输出   | `dist/`（纯静态，含 `404.html`、`_headers`、`robots.txt`、`sitemap.xml`、`og/og.png`、`models/cangze-residence.glb`）                                                                                 |
| 响应头 | `website/public/_headers`：`/assets/*` 一年期 `immutable`；全站启用 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy` |

本地构建与验证必须在 `${BUILD_SCRATCH_ROOT:-$HOME/.build}` 本机盘同步副本内执行，禁止在项目卷内产生 `node_modules/` 或 `dist/`。

## 自动部署与仓库 Secrets

`.github/workflows/website.yml` 在以下时机运行：

- `pull_request`（改动涉及 `website/**` 或 `.github/workflows/website.yml`）：执行 `pnpm run build` 与 Playwright `pnpm run verify`，不上传；
- `push` 到 `main`（改动涉及 `website/**` 或 `.github/workflows/website.yml`）、`repository_dispatch`（`release-published`）与手动 `workflow_dispatch`：校验通过后，自动检查/创建 `cangze-website` 项目并执行 `wrangler pages deploy dist --project-name cangze-website --branch main`。

需要在 GitHub 仓库 `IGNGserver/cangze` 的 **Settings → Secrets and variables → Actions** 配置两个最小权限 Secrets（凭据只放仓库 Secrets，严禁写入仓库、文档或日志）：

| Secret                  | 用途                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 最小权限 API Token（仅需 `Account → Cloudflare Pages → Edit`） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID                                             |

配置完两个 Secrets 后，可通过单条命令立即触发线上部署：

```bash
gh workflow run website.yml -R IGNGserver/cangze
```

首次建项后，在 Cloudflare Pages 控制台 `cangze-website` → **Custom domains** 绑定 `cangze.igng.net`（自动在 `igng.net` 区域创建 proxied CNAME `cangze` → `cangze-website.pages.dev`）。

## 回滚与上线后核对

- **快速回滚**：在 Cloudflare Pages 控制台 `cangze-website` → `Deployments` 选择上一成功生产部署点击 **Rollback to this deployment**，或通过 Cloudflare API 调用 `POST /accounts/{account_id}/pages/projects/cangze-website/deployments/{deployment_id}/rollback`。
- **上线后核对项**：
  - `https://cangze.igng.net/` 返回 `200`；
  - 不存在的路径返回 `404`（渲染 `404.html`）；
  - `/models/cangze-residence.glb`、`/og/og.png`、`/robots.txt`、`/sitemap.xml` 返回 `200`；
  - `/assets/*` 返回 `cache-control: public, max-age=31536000, immutable`；
  - 全站无第三方追踪脚本、无 Cookie、无外部 CDN 请求。

## 搜索收录与隐私边界

- **Google Search Console**：父域资源 `sc-domain:igng.net` 覆盖 `cangze.igng.net`；`public/robots.txt` 指向 `https://cangze.igng.net/sitemap.xml`。
- **Bing Webmaster Tools**：首页内置账号级验证标签 `<meta name="msvalidate.01" content="B411826ACAE5C5CD20EA5574C3F8A6E4">`，与其他 `*.igng.net` 官方站点一致。
- **零追踪承诺**：全站零第三方统计脚本、零 Cookie、零外部字体或模型 CDN 请求。
