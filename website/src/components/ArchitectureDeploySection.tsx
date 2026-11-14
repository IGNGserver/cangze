import { Check, Copy, Cpu, ExternalLink, Home, Lock, Server } from 'lucide-react';
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

const PROVIDERS = [
  { id: 'deepseek', zh: 'DeepSeek', en: 'DeepSeek' },
  { id: 'qwen', zh: '通义千问 Qwen', en: 'Qwen (DashScope)' },
  { id: 'openai', zh: 'OpenAI', en: 'OpenAI' },
  { id: 'claude', zh: 'Anthropic Claude', en: 'Anthropic Claude' },
  { id: 'gemini', zh: 'Google Gemini', en: 'Google Gemini' },
  { id: 'ollama', zh: 'Ollama（家里本地跑）', en: 'Ollama (Local at home)' },
  { id: 'lmstudio', zh: 'LM Studio', en: 'LM Studio' },
  { id: 'vllm', zh: 'vLLM / 各类兼容接口', en: 'vLLM / OpenAI-compatible' },
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
    <section
      id="deploy"
      data-section="deploy"
      className="cz-editorial-section cz-editorial-oat cz-deploy-section"
    >
      <div className="cz-wide-container">
        <div className="cz-wide-header">
          <div>
            <div className="cz-section-tag">{tr(COPY.deploy.tag, lang)}</div>
            <h2 className="cz-section-title">{tr(COPY.deploy.title, lang)}</h2>
            <p className="cz-section-desc">{tr(COPY.deploy.desc, lang)}</p>
          </div>
        </div>

        <div className="cz-deploy-grid">
          {/* Left: One-click Copy Command + Plain 3-Step Guide */}
          <div className="cz-terminal-card cz-warm-card">
            <div className="cz-terminal-head">
              <div className="cz-terminal-title">
                <Server size={16} className="cz-hearth-icon" />
                <strong>
                  {lang === 'zh'
                    ? '复制这几行命令，在家里 NAS 或主机上运行'
                    : 'Copy & run on your home NAS or mini PC'}
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
                  {copied ? (lang === 'zh' ? '已复制' : 'Copied') : lang === 'zh' ? '一键复制' : 'Copy'}
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
                    ? '启动后，在浏览器打开这台机器的 38417 端口（本机可直接点 http://localhost:38417），输入屏幕打印的配对码，设一个登录密码。'
                    : 'Open port 38417 in your browser (e.g. http://localhost:38417), enter the setup code shown in logs, and choose your admin password.'}
                </p>
              </div>
              <div>
                <span className="cz-step-num">2</span>
                <p>
                  {lang === 'zh'
                    ? '按照欢迎向导，填好你家 Home Assistant 的网址和长期访问令牌——不用安装任何插件，就能自动认出全屋房间与设备。'
                    : 'Enter your Home Assistant address and access token in the welcome guide—zero add-ons needed to recognize your rooms and devices.'}
                </p>
              </div>
              <div>
                <span className="cz-step-num">3</span>
                <p>
                  {lang === 'zh'
                    ? '选一个你喜欢的对话模型就能开始用；日常使用会定期存好加密备份，以后换设备也能轻松迁移。'
                    : 'Pick any AI model you like and start chatting right away, with encrypted backups ready whenever you upgrade hardware.'}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Supported Models + Family Commitments */}
          <div className="cz-providers-card cz-warm-card">
            <div className="cz-providers-head">
              <Cpu size={17} className="cz-hearth-icon" />
              <h3>
                {lang === 'zh'
                  ? '云端顺手的大模型，或家里本地免费跑的模型都支持'
                  : 'Use familiar cloud models or run 100% locally at home'}
              </h3>
            </div>
            <p className="cz-providers-desc">
              {lang === 'zh'
                ? '可以按自己预算自由搭配：聊家常挑一个聪明稳重的模型，整理标题和长对话用便宜轻快的模型；如果家里有显卡或 Mac，接上本地 Ollama 连网络都不用出。'
                : 'Pair your favorite reasoning model with an economical helper model—or point it to Ollama on your home machine so everything stays completely offline.'}
            </p>
            <div className="cz-provider-pills">
              {PROVIDERS.map((p) => (
                <span key={p.id} className="cz-provider-pill">
                  {tr(p, lang)}
                </span>
              ))}
            </div>

            <div className="cz-privacy-pledge">
              <Lock size={16} />
              <div>
                <strong>
                  {lang === 'zh' ? '三个让全家人放心的坚持' : 'Three simple promises for your family'}
                </strong>
                <p>
                  {lang === 'zh'
                    ? '家里作息和设备数据绝不上传给陌生人；原有开关和自动化照常好用；全部代码开源，不收月费也不弹广告。'
                    : 'Zero telemetry or cloud snooping, complete respect for your existing wall switches, and 100% free open-source code.'}
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
                <span>
                  {lang === 'zh'
                    ? '想了解底层安全机制与详细文档？前往 GitHub'
                    : 'Read technical docs on GitHub'}
                </span>
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                className="cz-doc-link is-secondary"
                onClick={() => onJumpSection('hero')}
              >
                <Home size={13} />
                <span>{lang === 'zh' ? '回到顶部看看房子' : 'Back to Home Overview'}</span>
              </button>
            </div>
          </div>
        </div>

        <footer className="cz-footer">
          <div className="cz-footer-brand">
            <img src="./brand/cangze-ridge.svg" alt="" width={24} height={24} className="cz-footer-logo" />
            <span>{lang === 'zh' ? '藏泽 Cangze' : 'Cangze'}</span>
            <span className="cz-footer-quote">「夫藏舟于壑，藏山于泽，谓之固矣。」</span>
          </div>
          <div className="cz-footer-meta">
            <span>{lang === 'zh' ? 'Apache-2.0 开源软件' : 'Apache-2.0 Open Source'}</span>
            <span>·</span>
            <span>{lang === 'zh' ? '连接你的 Home Assistant' : 'Made for Home Assistant'}</span>
            <span>·</span>
            <span>{lang === 'zh' ? '隐私只留在自己家里' : 'Private by Default'}</span>
          </div>
        </footer>
      </div>
    </section>
  );
}
