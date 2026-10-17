# 藏泽 · Cangze

> 夫藏舟于壑，藏山于泽，谓之固矣。 ——《庄子·大宗师》

**藏泽**是一款开源、私有部署的 AI 智能家居中枢，连接你已经在用的 Home Assistant。它通过 HA 的
WebSocket / REST API 接入（不需要安装 HA 插件或集成），让大语言模型安全地理解、控制和自动化你的家。

[English](README.md)

## 特性

- **会话**：可以创建任意多个平等的会话，各自拥有模型、上下文与历史，支持分支，工具调用实时可见。
- **子代理**：全局共享的持久化 Agent，拥有独立记忆与对话。主会话负责创建和管理它们；子代理按定时或
  Home Assistant 事件运行，设备权限由后端强制执行（默认拒绝、识别区域/设备/标签、参数范围、高风险操作审批）。
- **深度集成 Home Assistant**：状态、历史、日志、统计、带 schema 校验的服务调用、区域/楼层/设备/标签、
  自动化、脚本、场景、日历、待办。
- **冲突处理**：人工操作优先、代理之间分优先级、防抖动、防循环触发。
- **默认私有**：单容器、单个 SQLite 文件、凭据加密存储、无遥测；默认安全的网络策略，可选 Caddy HTTPS。

## 快速开始

```bash
mkdir cangze && cd cangze
curl -fsSLO https://raw.githubusercontent.com/IGNGserver/cangze/main/compose.yaml
docker compose up -d
docker compose logs cangze | grep -i bootstrap
```

浏览器打开 `http://<主机>:8080`，输入日志里的一次性引导码，设置管理员密钥，连接 Home Assistant
（地址 + 长期访问令牌），再添加一个模型服务即可开始使用。

HTTPS、反向代理、备份与升级见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 文档

- [架构](docs/ARCHITECTURE.md) · [架构决策记录](docs/adr)
- [参与贡献](CONTRIBUTING.md) · [安全策略](SECURITY.md)

## 许可证

[Apache-2.0](LICENSE)
