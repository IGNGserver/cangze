import { ArrowRight, Check, Copy, Cpu, ExternalLink, Lock, Server } from 'lucide-react';
import { useState } from 'react';
import { COPY, tr } from '../i18n/copy.ts';
import type { Lang, SectionId } from '../types/home.ts';

interface ArchitectureDeploySectionProps {
  lang: Lang;
  onJumpSection: (id: SectionId) => void;
}

const DEPLOY_SNIPPET = `mkdir cangze && cd cangze
VERSION=0.4.2
curl -fsSLO "https://github.com/IGNGserver/cangze/releases/download/v\${VERSION}/compose.yaml"
curl -fsSL "https://github.com/IGNGserver/cangze/releases/download/v\${VERSION}/env.example" -o .env
docker compose up -d
docker compose logs cangze | grep -i bootstrap`;

const INVARIANTS: Array<{
  code: string;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
}> = [
  {
    code: 'INV-01',
    title: { zh: 'HaGateway 唯一写出口与双重鉴权', en: 'Single Write Gateway & Double Guard' },
    desc: {
      zh: '任何对 Home Assistant 的写操作必须携带 Principal 经过 HaGateway，并在工具层 beforeToolCall 与网关内部双重调用 PolicyEngine。',
      en: 'Every HA write carries a Principal through HaGateway and enforces PolicyEngine both in beforeToolCall and inside the gateway.',
    },
  },
  {
    code: 'INV-02',
    title: { zh: '鉴权前递归展开显式实体', en: 'Pre-Auth Recursive Target Expansion' },
    desc: {
      zh: 'area / floor / device / label 与嵌套群组在权限评估前递归展开为叶子 entity_id，环路群组直接拒绝，最终仅向 HA 发送显式实体列表。',
      en: 'Area, floor, device, label, and nested group targets expand to explicit leaf entity_ids prior to authorization; cyclic groups fail closed.',
    },
  },
  {
    code: 'INV-03',
    title: { zh: '子代理默认拒绝与禁止自提权', en: 'Default-Deny & Zero Self-Escalation' },
    desc: {
      zh: '子代理仅能看见和调用规则允许的实体与工具；永不授予 agent_* 管理工具，杜绝创建子代理或篡改自身定义与权限。',
      en: 'Subagents default-deny on both reads and writes and can never hold agent_* management tools or alter their own permissions.',
    },
  },
  {
    code: 'INV-04',
    title: { zh: '只追加修订与凭据密文存储', en: 'Append-Only Revisions & Encrypted Secrets' },
    desc: {
      zh: 'agent_revisions 与 SQLite 迁移均为只追加；所有 LLM Key 与 HA Token 仅以 AES-256-GCM 密文落盘，重启绝不重放中断的设备写操作。',
      en: 'Immutable append-only agent_revisions & SQL migrations; AES-256-GCM secrets at rest; restarts never replay interrupted device writes.',
    },
  },
];

const PROVIDERS = [
  'OpenAI',
  'Anthropic',
  'DeepSeek',
  'Qwen 通义千问',
  'Google Gemini',
  'Ollama (Local)',
  'vLLM',
  'LM Studio',
  'OpenAI / Anthropic Compatible Gateways',
];

export function ArchitectureDeploySection({ lang, onJumpSection }: ArchitectureDeploySectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DEPLOY_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section id="deploy" data-section="deploy" className="cz-section cz-wide-section cz-deploy-section">
      <div className="cz-wide-container">
        <div className="cz-wide-header">
          <div>
            <div className="cz-section-tag">{tr(COPY.deploy.tag, lang)}</div>
            <h2 className="cz-section-title">{tr(COPY.deploy.title, lang)}</h2>
            <p className="cz-section-desc">{tr(COPY.deploy.desc, lang)}</p>
          </div>
        </div>

        {/* End-to-End Architecture Execution Pipeline */}
        <div className="cz-pipeline-card cz-glass-panel">
          <div className="cz-pipeline-label cz-mono">
            {lang === 'zh'
              ? '端到端受控执行链路 · Node 24 + Fastify 5 + SQLite (WAL) + Pi Agent'
              : 'Controlled Execution Pipeline · Node 24 + Fastify 5 + SQLite (WAL) + Pi Agent'}
          </div>
          <div className="cz-pipeline-track">
            {[
              { step: 'Principal', sub: 'admin · session · agent@rev' },
              { step: 'AgentRunner', sub: 'pi-agent-core · beforeToolCall' },
              { step: 'Target Expand', sub: 'area/floor/group → leaf ids' },
              { step: 'Coordination', sub: 'manual 30m · prio · lease' },
              { step: 'Policy & Approval', sub: 'default-deny · high-risk gate' },
              { step: 'HaGateway', sub: 'Home Assistant WS / REST' },
            ].map((node, idx, arr) => (
              <div key={node.step} className="cz-pipe-item">
                <div className="cz-pipe-node">
                  <strong>{node.step}</strong>
                  <span className="cz-mono">{node.sub}</span>
                </div>
                {idx < arr.length - 1 && <ArrowRight size={15} className="cz-pipe-arrow" />}
              </div>
            ))}
          </div>
        </div>

        {/* 4 Core Architectural Invariant Cards */}
        <div className="cz-invariants-grid">
          {INVARIANTS.map((inv) => (
            <div key={inv.code} className="cz-inv-card cz-glass-panel">
              <span className="cz-inv-code cz-mono">{inv.code}</span>
              <h3>{tr(inv.title, lang)}</h3>
              <p>{tr(inv.desc, lang)}</p>
            </div>
          ))}
        </div>

        {/* Quickstart Terminal + Provider Matrix */}
        <div className="cz-deploy-grid">
          <div className="cz-terminal-card cz-glass-panel">
            <div className="cz-terminal-head">
              <div className="cz-terminal-title">
                <Server size={15} className="cz-accent-icon" />
                <strong>
                  {lang === 'zh' ? 'Docker Compose 快速部署（v0.4.2）' : 'Docker Compose Quickstart (v0.4.2)'}
                </strong>
              </div>
              <button
                type="button"
                data-testid="copy-compose-btn"
                className="cz-copy-btn"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>
                  {copied ? (lang === 'zh' ? '已复制' : 'Copied') : lang === 'zh' ? '复制命令' : 'Copy'}
                </span>
              </button>
            </div>

            <pre className="cz-terminal-pre cz-mono" data-testid="deploy-code-block">
              <code>{DEPLOY_SNIPPET}</code>
            </pre>

            <div className="cz-terminal-steps">
              <div>
                <span className="cz-step-num">1</span>
                <p>
                  {lang === 'zh'
                    ? '本机打开 http://127.0.0.1:38417（默认仅绑定回环），输入容器日志打印的一次性引导码并设置管理员密钥。'
                    : 'Open http://127.0.0.1:38417, enter the one-time bootstrap code from container logs, and set your admin key.'}
                </p>
              </div>
              <div>
                <span className="cz-step-num">2</span>
                <p>
                  {lang === 'zh'
                    ? '填入 Home Assistant 地址与专用账号的长期访问令牌（无需在 HA 安装任何插件或自定义组件）。'
                    : 'Enter your Home Assistant URL and a dedicated user’s long-lived access token — zero HA add-ons required.'}
                </p>
              </div>
              <div>
                <span className="cz-step-num">3</span>
                <p>
                  {lang === 'zh'
                    ? '镜像：ghcr.io/igngserver/cangze:0.4.2（支持 linux/amd64 与 linux/arm64，附带 SLSA 来源证明与 SBOM）。'
                    : 'Multi-arch image ghcr.io/igngserver/cangze:0.4.2 (amd64 & arm64) with SLSA provenance and SBOM.'}
                </p>
              </div>
            </div>
          </div>

          <div className="cz-providers-card cz-glass-panel">
            <div className="cz-providers-head">
              <Cpu size={16} className="cz-accent-icon" />
              <h3>
                {lang === 'zh' ? '自由选择云端前沿模型或纯本地推理' : 'Cloud Frontier or 100% Local Models'}
              </h3>
            </div>
            <p className="cz-providers-desc">
              {lang === 'zh'
                ? '基于 pi-ai 统一适配层，支持对话主模型与低成本辅助模型（标题生成 / 上下文摘要压缩）分离配置，支持自动发现兼容端点模型列表与视觉多模态输入。'
                : 'Built on pi-ai: pair a reasoning chat model with a lightweight utility model for titles & compaction, or run completely offline via Ollama / vLLM.'}
            </p>
            <div className="cz-provider-pills">
              {PROVIDERS.map((p) => (
                <span key={p} className="cz-provider-pill">
                  {p}
                </span>
              ))}
            </div>

            <div className="cz-privacy-pledge">
              <Lock size={15} />
              <div>
                <strong>
                  {lang === 'zh' ? 'Apache-2.0 开源 · 零遥测承诺' : 'Apache-2.0 Open Source · Zero Telemetry'}
                </strong>
                <p>
                  {lang === 'zh'
                    ? '藏泽不收集任何遥测或分析数据。所有对话树、家庭拓扑、子代理记忆与加密密钥仅保存在你自己的 /data 数据卷中。'
                    : 'Cangze collects zero telemetry. Every conversation, home topology, memory note, and encrypted secret stays solely in your /data volume.'}
                </p>
              </div>
            </div>

            <div className="cz-doc-links">
              <a
                href="https://github.com/IGNGserver/cangze"
                target="_blank"
                rel="noreferrer"
                className="cz-doc-link"
              >
                <span>GitHub · IGNGserver/cangze</span>
                <ExternalLink size={13} />
              </a>
              <button type="button" className="cz-doc-link" onClick={() => onJumpSection('hero')}>
                <span>{lang === 'zh' ? '回到顶部 3D 泽居' : 'Back to 3D Residence'}</span>
              </button>
            </div>
          </div>
        </div>

        <footer className="cz-footer">
          <div className="cz-footer-brand">
            <img src="./brand/cangze-ridge.svg" alt="" width={24} height={24} />
            <span>藏泽 Cangze · v0.4.2</span>
            <span className="cz-footer-quote">「夫藏舟于壑，藏山于泽，谓之固矣。」</span>
          </div>
          <div className="cz-footer-meta cz-mono">
            <span>Apache-2.0 License</span>
            <span>·</span>
            <span>Home Assistant WebSocket &amp; REST</span>
            <span>·</span>
            <span>Fluent 2 Design System</span>
          </div>
        </footer>
      </div>
    </section>
  );
}
