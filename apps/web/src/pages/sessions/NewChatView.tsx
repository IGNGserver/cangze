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
import { Composer, type ComposerSend } from './Composer.tsx';

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

  const effectiveRef = defaults.data?.chat ?? null;
  const model = useMemo(() => models.data?.find((m) => m.ref === effectiveRef), [models.data, effectiveRef]);
  const noModel = !models.isLoading && !effectiveRef;
  const hasContent = Boolean(liveText.trim()) || Boolean(draft?.text.trim()) || Boolean(draft?.images.length);

  const handleText = useCallback((value: string) => setLiveText(value), []);

  const send = async ({ text, draftRevision }: ComposerSend) => {
    const res = await api.post<CreateSessionResult>('/sessions', {
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
        <Typography.Title level={5} style={{ margin: 0, flex: 1, minWidth: 0 }} ellipsis>
          {t('chat.newSession')}
        </Typography.Title>
      </Flex>

      <div style={{ flex: 1, minHeight: 0, padding: '0 16px' }}>
        {!hasContent && (
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
            <Prompts
              items={suggestions}
              wrap
              onItemClick={(info) => void startPrompt(String(info.data.description))}
            />
          </Flex>
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
