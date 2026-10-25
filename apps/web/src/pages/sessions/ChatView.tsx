import { Prompts, Welcome } from '@ant-design/x';
import { ArrowLeft20Regular, Settings20Regular } from '@fluentui/react-icons';
import type { ModelInfo, ThinkingLevel } from '@cangze/contracts';
import { Alert, App, Button, Flex, Grid, Progress, Select, Skeleton, theme, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../../api/client.ts';
import { useDraft } from '../../api/drafts.tsx';
import { useChat, useModelDefaults, useModels } from '../../api/sessions.ts';
import { Logo } from '../../components/Logo.tsx';
import { errorText } from '../../lib/errors.ts';
import { Composer, type ComposerSend } from './Composer.tsx';
import { MessageList } from './MessageList.tsx';
import { ModelPicker } from './ModelPicker.tsx';
import { SessionDrawer } from './SessionDrawer.tsx';

export function ChatView({ id }: { id: string }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const { state, loading, error, reload, clearError } = useChat(id);
  const { draft } = useDraft(id);
  const models = useModels();
  const defaults = useModelDefaults();
  const [drawer, setDrawer] = useState(false);
  const [liveText, setLiveText] = useState('');
  const d = state.detail;

  const effectiveRef = d?.modelRef ?? defaults.data?.chat ?? null;
  const model: ModelInfo | undefined = useMemo(
    () => models.data?.find((m) => m.ref === effectiveRef),
    [models.data, effectiveRef],
  );

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch(`/sessions/${id}`, body);
      reload();
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  if (loading || !d) {
    return error ? (
      <Alert type="error" message={errorText(t, error)} style={{ margin: 24 }} />
    ) : (
      <Skeleton active style={{ padding: 24 }} />
    );
  }

  const ctxPct =
    d.contextTokens && d.contextWindow
      ? Math.min(100, Math.round((d.contextTokens / d.contextWindow) * 100))
      : 0;
  const empty = state.entries.length === 0 && !state.running;
  const noModel = !models.isLoading && !effectiveRef;
  const hasDraft = Boolean(draft?.text.trim()) || Boolean(draft?.images.length) || Boolean(liveText.trim());

  const send = async ({ text, whenBusy, draftRevision }: ComposerSend) => {
    await api.post(`/sessions/${id}/messages`, {
      text,
      images: [],
      whenBusy,
      draftRevision,
    });
  };

  const suggestions = [
    { key: 'lights', description: t('chat.suggest.lights') },
    { key: 'dim', description: t('chat.suggest.dim') },
    { key: 'temp', description: t('chat.suggest.temp') },
    { key: 'automation', description: t('chat.suggest.automation') },
  ];

  return (
    <Flex vertical style={{ height: '100%', minWidth: 0 }}>
      <Flex
        align="center"
        gap={8}
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          minHeight: 56,
        }}
      >
        {!screens.md && (
          <Button
            type="text"
            icon={<ArrowLeft20Regular />}
            onClick={() => navigate('/sessions')}
            aria-label={t('common.back')}
          />
        )}
        <Typography.Title
          level={5}
          style={{ margin: 0, flex: 1, minWidth: 0 }}
          ellipsis
          editable={{
            onChange: (v) => v.trim() && v !== d.title && void patch({ title: v.trim() }),
            tooltip: t('common.edit'),
          }}
        >
          {d.title || t('chat.untitled')}
        </Typography.Title>
        {screens.md && (
          <ModelPicker size="small" value={d.modelRef} onChange={(v) => void patch({ modelRef: v })} />
        )}
        {screens.md && model?.reasoning && (
          <Select<ThinkingLevel | '__default'>
            size="small"
            value={d.thinkingLevel ?? '__default'}
            onChange={(v) => void patch({ thinkingLevel: v === '__default' ? null : v })}
            style={{ width: 120 }}
            options={[
              { value: '__default', label: t('chat.thinkingDefault') },
              ...model.thinkingLevels.map((l) => ({ value: l, label: t(`chat.levels.${l}`) })),
            ]}
          />
        )}
        <Tooltip title={t('chat.context', { used: d.contextTokens ?? 0, total: d.contextWindow ?? '?' })}>
          <Progress
            type="circle"
            percent={ctxPct}
            size={22}
            showInfo={false}
            strokeColor={ctxPct > 80 ? token.colorWarning : token.colorPrimary}
          />
        </Tooltip>
        <Button
          type="text"
          icon={<Settings20Regular />}
          onClick={() => setDrawer(true)}
          aria-label={t('chat.sessionSettings')}
        />
      </Flex>

      <div style={{ flex: 1, minHeight: 0, padding: '0 16px' }}>
        {empty ? (
          <Flex
            vertical
            align="center"
            justify="center"
            gap={24}
            style={{ height: '100%', maxWidth: 720, margin: '0 auto' }}
          >
            <Welcome
              icon={<Logo size={48} />}
              title={t('chat.welcomeTitle')}
              description={t('chat.welcomeText')}
              variant="borderless"
            />
            {!hasDraft && (
              <Prompts
                items={suggestions}
                wrap
                onItemClick={(info) =>
                  void api
                    .post(`/sessions/${id}/messages`, { text: String(info.data.description) })
                    .catch((e) => message.error(errorText(t, e)))
                }
              />
            )}
          </Flex>
        ) : (
          <div style={{ height: '100%', maxWidth: 860, margin: '0 auto' }}>
            <MessageList sessionId={id} state={state} />
          </div>
        )}
      </div>

      <div style={{ padding: '8px 16px 16px', maxWidth: 892, width: '100%', margin: '0 auto' }}>
        {noModel && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 8 }}
            message={t('chat.noModelConfigured')}
            action={
              <Button size="small" onClick={() => navigate('/settings/models')}>
                {t('devices.openSettings')}
              </Button>
            }
          />
        )}
        {state.lastError && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={clearError}
            style={{ marginBottom: 8 }}
            message={state.lastError}
          />
        )}
        <Composer
          scope={id}
          running={state.running}
          queued={state.queued}
          vision={model?.vision ?? false}
          onSend={send}
          onStop={() => void api.post(`/sessions/${id}/abort`).catch(() => undefined)}
          onTextChange={setLiveText}
        />
      </div>
      <SessionDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        detail={d}
        model={model}
        onChanged={reload}
      />
    </Flex>
  );
}
