import { Bubble, type BubbleItemType } from '@ant-design/x';
import {
  ArrowClockwise16Regular,
  ChevronLeft16Regular,
  ChevronRight16Regular,
  Copy16Regular,
  Edit16Regular,
} from '@fluentui/react-icons';
import type { Entry } from '@cangze/contracts';
import { App, Button, Flex, Image, Input, Modal, Popover, Space, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import type { ChatState } from '../../api/sessions.ts';
import { errorText } from '../../lib/errors.ts';
import { ApprovalCard } from './ApprovalCard.tsx';
import { AssistantContent, type ToolResultInfo } from './AssistantContent.tsx';

interface MsgBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

function userText(message: Record<string, unknown>): { text: string; images: MsgBlock[] } {
  const c = message.content as string | MsgBlock[];
  if (typeof c === 'string') return { text: c, images: [] };
  return {
    text: c
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n'),
    images: c.filter((b) => b.type === 'image'),
  };
}

function assistantText(message: Record<string, unknown>): string {
  return ((message.content as MsgBlock[]) ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function MessageList({
  sessionId,
  state,
  readOnly = false,
}: {
  sessionId: string | null;
  state: ChatState;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<{ entryId: string; text: string } | null>(null);

  const results = useMemo(() => {
    const m = new Map<string, ToolResultInfo>();
    for (const e of state.entries) {
      if (e.role !== 'toolResult') continue;
      const msg = e.data.message as {
        toolCallId: string;
        isError: boolean;
        content: MsgBlock[];
        details?: unknown;
      };
      m.set(msg.toolCallId, {
        text: msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n'),
        isError: msg.isError,
        details: msg.details,
      });
    }
    return m;
  }, [state.entries]);

  const post = async (path: string, body: unknown) => {
    try {
      await api.post(`/sessions/${sessionId}/${path}`, body);
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => message.success(t('chat.copied')));
  };

  const branchSwitcher = (e: Entry) =>
    e.branch && (
      <Space size={0}>
        <Button
          type="text"
          size="small"
          icon={<ChevronLeft16Regular />}
          disabled={e.branch.index === 0 || state.running}
          aria-label={t('chat.prevBranch')}
          onClick={() => void post('branch', { entryId: e.branch!.siblingIds[e.branch!.index - 1] })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {e.branch.index + 1}/{e.branch.count}
        </Typography.Text>
        <Button
          type="text"
          size="small"
          icon={<ChevronRight16Regular />}
          disabled={e.branch.index + 1 >= e.branch.count || state.running}
          aria-label={t('chat.nextBranch')}
          onClick={() => void post('branch', { entryId: e.branch!.siblingIds[e.branch!.index + 1] })}
        />
      </Space>
    );

  const items: BubbleItemType[] = [];
  const lastAssistantIndex = (() => {
    for (let i = state.entries.length - 1; i >= 0; i--) if (state.entries[i]!.role === 'assistant') return i;
    return -1;
  })();

  state.entries.forEach((e, i) => {
    if (e.kind === 'message' && e.role === 'user') {
      const { text, images } = userText(e.data.message as Record<string, unknown>);
      items.push({
        key: e.id,
        role: 'user',
        content: (
          <div>
            {images.length > 0 && (
              <Image.PreviewGroup>
                <Flex gap={6} wrap style={{ marginBottom: text ? 8 : 0 }}>
                  {images.map((img, k) => (
                    <Image
                      key={k}
                      src={`data:${img.mimeType};base64,${img.data}`}
                      width={96}
                      height={96}
                      style={{ objectFit: 'cover', borderRadius: 6 }}
                    />
                  ))}
                </Flex>
              </Image.PreviewGroup>
            )}
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
          </div>
        ),
        footer: (
          <Flex gap={2} align="center" justify="flex-end">
            {!readOnly && branchSwitcher(e)}
            <Tooltip title={t('chat.copy')}>
              <Button type="text" size="small" icon={<Copy16Regular />} onClick={() => copy(text)} />
            </Tooltip>
            {!readOnly && (
              <Tooltip title={t('chat.edit')}>
                <Button
                  type="text"
                  size="small"
                  icon={<Edit16Regular />}
                  disabled={state.running}
                  onClick={() => setEditing({ entryId: e.id, text })}
                />
              </Tooltip>
            )}
          </Flex>
        ),
      });
    } else if (e.kind === 'message' && e.role === 'assistant') {
      const msg = e.data.message as Record<string, unknown>;
      const text = assistantText(msg);
      const isLast = i === lastAssistantIndex;
      const usage = msg.usage as { input?: number; output?: number; cost?: { total?: number } } | undefined;
      items.push({
        key: e.id,
        role: 'ai',
        content: (
          <AssistantContent message={msg} results={results} liveTools={state.tools} streaming={false} />
        ),
        footer:
          text || isLast ? (
            <Flex gap={2} align="center">
              {text && (
                <Tooltip title={t('chat.copy')}>
                  <Button type="text" size="small" icon={<Copy16Regular />} onClick={() => copy(text)} />
                </Tooltip>
              )}
              {isLast && !state.running && !readOnly && (
                <Tooltip title={t('chat.regenerate')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowClockwise16Regular />}
                    onClick={() => void post('regenerate', { entryId: e.id })}
                  />
                </Tooltip>
              )}
              {usage && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {String(msg.model ?? '')} · {usage.input ?? 0}↑ {usage.output ?? 0}↓
                </Typography.Text>
              )}
            </Flex>
          ) : undefined,
      });
    } else if (e.kind === 'notice') {
      const n = e.data as { level: string; title: string; body: string };
      items.push({
        key: e.id,
        role: 'notice',
        content: (
          <div>
            <Typography.Text strong>{n.title}</Typography.Text>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.body}</div>
          </div>
        ),
      });
    } else if (e.kind === 'compaction') {
      const c = e.data as { summary: string };
      items.push({
        key: e.id,
        role: 'divider',
        content: (
          <Popover
            content={<div style={{ maxWidth: 480, whiteSpace: 'pre-wrap' }}>{c.summary}</div>}
            title={t('chat.summary')}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>
              {t('chat.compacted')}
            </Typography.Text>
          </Popover>
        ),
      });
    } else if (e.kind === 'model_change') {
      items.push({
        key: e.id,
        role: 'divider',
        content: (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('chat.modelChanged', {
              model: String((e.data as { modelRef?: string }).modelRef ?? t('chat.defaultModel')),
            })}
          </Typography.Text>
        ),
      });
    }
  });

  if (state.running) {
    if (state.partial) {
      items.push({
        key: 'partial',
        role: 'ai',
        content: (
          <AssistantContent message={state.partial} results={results} liveTools={state.tools} streaming />
        ),
      });
    } else if (!Object.values(state.tools).some((t) => !t.done) && state.approvals.length === 0) {
      items.push({ key: 'loading', role: 'ai', content: '', loading: true });
    }
  }
  for (const a of state.approvals) {
    items.push({ key: `approval-${a.id}`, role: 'approval', content: <ApprovalCard approval={a} /> });
  }

  return (
    <>
      <Bubble.List
        items={items}
        autoScroll
        style={{ height: '100%' }}
        styles={{ scroll: { padding: '16px 0' } }}
        role={{
          user: { placement: 'end', variant: 'filled', shape: 'corner' },
          ai: {
            placement: 'start',
            variant: 'borderless',
            styles: { content: { width: '100%', maxWidth: 760, padding: 0 } },
          },
          notice: { placement: 'start', variant: 'outlined', styles: { content: { maxWidth: 640 } } },
          approval: { placement: 'start', variant: 'borderless', styles: { content: { padding: 0 } } },
        }}
      />
      <Modal
        open={Boolean(editing)}
        title={t('chat.editTitle')}
        okText={t('chat.sendEdit')}
        onCancel={() => setEditing(null)}
        onOk={() => {
          if (!editing?.text.trim()) return;
          void post('edit', editing);
          setEditing(null);
        }}
      >
        <Typography.Paragraph type="secondary">{t('chat.editHint')}</Typography.Paragraph>
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 12 }}
          value={editing?.text}
          onChange={(ev) => setEditing((s) => (s ? { ...s, text: ev.target.value } : s))}
        />
      </Modal>
    </>
  );
}
