import { Think, ThoughtChain, type ThoughtChainItemType } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { Wrench16Regular } from '@fluentui/react-icons';
import { Alert, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { LiveTool } from '../../api/sessions.ts';
import { toolSummary } from './toolSummary.ts';

interface Block {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultInfo {
  text: string;
  isError: boolean;
  details?: unknown;
}

export function AssistantContent({
  message,
  results,
  liveTools,
  streaming,
}: {
  message: Record<string, unknown>;
  results: Map<string, ToolResultInfo>;
  liveTools: Record<string, LiveTool>;
  streaming: boolean;
}) {
  const { t } = useTranslation();
  const blocks = (message.content as Block[] | undefined) ?? [];
  const stop = message.stopReason as string | undefined;
  const calls = blocks.filter((b) => b.type === 'toolCall');
  const items: ThoughtChainItemType[] = calls.map((c) => {
    const result = results.get(c.id ?? '');
    const live = liveTools[c.id ?? ''];
    const status: ThoughtChainItemType['status'] = result
      ? result.isError
        ? 'error'
        : 'success'
      : live && !live.done
        ? 'loading'
        : streaming
          ? 'loading'
          : 'abort';
    return {
      key: c.id,
      icon: <Wrench16Regular />,
      title: t(`tools.${c.name}`, { defaultValue: c.name }),
      description: toolSummary(c.name ?? '', c.arguments ?? {}),
      status,
      collapsible: true,
      content: (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('chat.arguments')}
          </Typography.Text>
          <pre className="cz-mono" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 8px' }}>
            {JSON.stringify(c.arguments ?? {}, null, 2)}
          </pre>
          {result && (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('chat.result')}
              </Typography.Text>
              <pre
                className="cz-mono"
                style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', maxHeight: 320, overflow: 'auto' }}
              >
                {result.text}
              </pre>
            </>
          )}
        </div>
      ),
    };
  });

  return (
    <div style={{ minWidth: 0 }}>
      {blocks
        .filter((b) => b.type === 'thinking' && (b.thinking ?? '').trim())
        .map((b, i) => (
          <Think
            key={`th${i}`}
            title={
              streaming && !blocks.some((x) => x.type === 'text' && x.text)
                ? t('chat.thinking')
                : t('chat.thought')
            }
            loading={streaming && !blocks.some((x) => x.type === 'text' && x.text)}
            defaultExpanded={false}
            style={{ marginBottom: 8 }}
          >
            <Typography.Paragraph
              type="secondary"
              style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: 0 }}
            >
              {b.thinking}
            </Typography.Paragraph>
          </Think>
        ))}
      {blocks
        .filter((b) => b.type === 'text' && b.text)
        .map((b, i) => (
          <XMarkdown
            key={`tx${i}`}
            content={b.text}
            streaming={{ hasNextChunk: streaming, enableAnimation: false }}
            openLinksInNewTab
          />
        ))}
      {items.length > 0 && <ThoughtChain items={items} style={{ marginTop: 8 }} />}
      {stop === 'error' && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message={String(message.errorMessage ?? t('chat.failed'))}
        />
      )}
      {stop === 'aborted' && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('chat.stopped')}
        </Typography.Text>
      )}
    </div>
  );
}
