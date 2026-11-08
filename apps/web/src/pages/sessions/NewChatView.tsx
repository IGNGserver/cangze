import { Prompts, Welcome } from '@ant-design/x';
import { ArrowLeft20Regular } from '@fluentui/react-icons';
import type { CreateSessionResult } from '@cangze/contracts';
import { Alert, App, Button, Flex, Grid, theme, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../../api/client.ts';
import { useDraft } from '../../api/drafts.tsx';
import { useModelDefaults, useModels } from '../../api/sessions.ts';
import { Logo } from '../../components/Logo.tsx';
import { errorText } from '../../lib/errors.ts';
import { LAYOUT } from '../../theme/fluent.ts';
import { Composer, type ComposerSend } from './Composer.tsx';
import { ModelPicker, ThinkingPicker, type ThinkingPickerValue } from './ModelPicker.tsx';

/** The single unsent new chat: no session exists until the first message is sent. */
export function NewChatView() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const models = useModels();
  const defaults = useModelDefaults();
  const { draft } = useDraft('new');
  const [liveText, setLiveText] = useState('');
  const [starting, setStarting] = useState(false);
  // null and __default intentionally inherit the current defaults instead of persisting a copy.
  const [modelRef, setModelRef] = useState<string | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingPickerValue>('__default');

  const effectiveRef = modelRef ?? defaults.data?.chat ?? null;
  const model = useMemo(() => models.data?.find((m) => m.ref === effectiveRef), [models.data, effectiveRef]);
  const noModel = !models.isLoading && !effectiveRef;
  const hasContent = Boolean(liveText.trim()) || Boolean(draft?.text.trim()) || Boolean(draft?.images.length);

  const handleText = useCallback((value: string) => setLiveText(value), []);
  const handleModel = useCallback((ref: string | null) => {
    setModelRef(ref);
    // A level is model-specific. Avoid submitting a stale explicit level after switching models.
    setThinkingLevel('__default');
  }, []);

  const sessionOptions = () => ({
    ...(modelRef ? { modelRef } : {}),
    ...(thinkingLevel !== '__default' && model?.reasoning ? { thinkingLevel } : {}),
  });

  const send = async ({ text, draftRevision }: ComposerSend) => {
    const res = await api.post<CreateSessionResult>('/sessions', {
      ...sessionOptions(),
      message: { text, images: [], whenBusy: 'steer' },
      draftRevision,
    });
    navigate(`/sessions/${res.id}`, { replace: true });
  };

  const startPrompt = async (text: string) => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await api.post<CreateSessionResult>('/sessions', {
        ...sessionOptions(),
        message: { text, images: [], whenBusy: 'steer' },
        draftRevision: draft?.revision ?? null,
      });
      navigate(`/sessions/${res.id}`, { replace: true });
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setStarting(false);
    }
  };

  const suggestions = [
    { key: 'lights', description: t('chat.suggest.lights') },
    { key: 'dim', description: t('chat.suggest.dim') },
    { key: 'temp', description: t('chat.suggest.temp') },
    { key: 'automation', description: t('chat.suggest.automation') },
  ];

  const padX = screens.md ? LAYOUT.paddingLG : LAYOUT.paddingMD;

  return (
    <Flex vertical style={{ height: '100%', minWidth: 0 }}>
      <Flex
        align="center"
        gap={LAYOUT.gapSM}
        style={{
          padding: `0 ${padX}px`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          height: LAYOUT.headerHeight,
          minHeight: LAYOUT.headerHeight,
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
        <Typography.Title level={5} style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 16 }} ellipsis>
          {t('chat.newSession')}
        </Typography.Title>
      </Flex>

      <div className="cz-scroll" style={{ flex: 1, minHeight: 0, padding: `0 ${padX}px` }}>
        {!hasContent && (
          <Flex
            vertical
            align="center"
            justify="center"
            gap={LAYOUT.gapXL}
            style={{
              minHeight: '100%',
              maxWidth: LAYOUT.contentMaxWidth - padX * 2,
              margin: '0 auto',
              padding: `${LAYOUT.paddingLG}px 0`,
            }}
          >
            <Welcome
              icon={<Logo size={48} />}
              title={t('chat.welcomeTitle')}
              description={t('chat.welcomeText')}
              variant="borderless"
            />
            <Prompts
              items={suggestions}
              wrap
              onItemClick={(info) => void startPrompt(String(info.data.description))}
            />
          </Flex>
        )}
      </div>

      <div
        style={{
          padding: `${LAYOUT.paddingXS}px ${padX}px ${LAYOUT.paddingMD}px`,
          maxWidth: LAYOUT.contentMaxWidth,
          width: '100%',
          margin: '0 auto',
        }}
      >
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
        <Flex align="center" gap={8} wrap style={{ marginBottom: 8 }}>
          <Typography.Text type="secondary">{t('chat.model')}</Typography.Text>
          <ModelPicker value={modelRef} onChange={handleModel} size="small" style={{ minWidth: 180 }} />
          <ThinkingPicker
            model={model}
            value={thinkingLevel}
            onChange={setThinkingLevel}
            size="small"
            style={{ width: 144 }}
          />
        </Flex>
        <Composer
          scope="new"
          running={false}
          queued={0}
          vision={model?.vision ?? false}
          disabled={!effectiveRef}
          autoFocus
          onSend={send}
          onTextChange={handleText}
        />
      </div>
    </Flex>
  );
}
