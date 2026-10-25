import { Sender } from '@ant-design/x';
import { Dismiss12Regular, Image20Regular, Send20Filled, Stop20Filled } from '@fluentui/react-icons';
import { Alert, App, Button, Flex, Segmented, Spin, Tooltip, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client.ts';
import { draftImageUrl } from '../../api/drafts.tsx';
import { errorText } from '../../lib/errors.ts';
import { useComposerDraft, type SendDraftRevision } from './useComposerDraft.ts';

export interface ComposerSend {
  text: string;
  whenBusy: 'steer' | 'followUp';
  draftRevision: SendDraftRevision;
}

export function Composer({
  scope,
  running,
  queued,
  vision,
  disabled = false,
  autoFocus = false,
  onSend,
  onStop,
  onTextChange,
}: {
  scope: string;
  running: boolean;
  queued: number;
  vision: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onSend: (input: ComposerSend) => Promise<void>;
  onStop?: () => void;
  onTextChange?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const draft = useComposerDraft(scope, vision);
  const [whenBusy, setWhenBusy] = useState<'steer' | 'followUp'>('steer');
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) wrapRef.current?.querySelector('textarea')?.focus();
  }, [autoFocus]);

  useEffect(() => {
    onTextChange?.(draft.text);
  }, [draft.text, onTextChange]);

  const send = async (value: string) => {
    if (!draft.canSend) return;
    try {
      await draft.send(value, ({ text, draftRevision }) => onSend({ text, whenBusy, draftRevision }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'draft_conflict') return;
      void message.error(errorText(t, e));
    }
  };

  const imagesUnsupported = !vision && draft.images.length > 0;
  const attachments = draft.images.length + draft.uploading.length;
  const conflict = draft.conflict;

  return (
    <div ref={wrapRef}>
      {conflict ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={t('chat.draftConflictTitle')}
          description={conflict.draft ? t('chat.draftConflictText') : t('chat.draftDeletedElsewhere')}
          action={
            <Flex gap={4}>
              {conflict.draft && (
                <Button size="small" onClick={draft.resolveRemote} disabled={draft.saving}>
                  {t('chat.draftUseRemote')}
                </Button>
              )}
              <Button
                size="small"
                type="primary"
                onClick={() => void draft.resolveLocal()}
                disabled={draft.saving}
              >
                {t('chat.draftKeepMine')}
              </Button>
            </Flex>
          }
        />
      ) : imagesUnsupported ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={t('chat.draftImagesUnsupported')}
        />
      ) : !draft.syncAvailable ? (
        <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={t('chat.draftSyncUnavailable')} />
      ) : draft.error ? (
        <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={t('chat.draftSaveFailed')} />
      ) : draft.uploading.length > 0 || draft.saving ? (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          {draft.uploading.length > 0 ? t('chat.imageUploading') : t('chat.draftSaving')}
        </Typography.Text>
      ) : null}
      <Sender
        value={draft.text}
        onChange={draft.setText}
        onSubmit={(v) => void send(v)}
        onPasteFile={(files) => vision && void draft.addFiles(files)}
        disabled={disabled || !draft.ready}
        autoSize={{ minRows: 1, maxRows: 8 }}
        placeholder={running ? t('chat.placeholderBusy') : t('chat.placeholder')}
        header={
          attachments > 0 ? (
            <Flex gap={8} wrap style={{ padding: '8px 12px 0' }}>
              {draft.images.map((img) => (
                <div key={img.id} style={{ position: 'relative' }}>
                  <img
                    src={draftImageUrl(scope, img.id)}
                    alt=""
                    style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }}
                  />
                  <Button
                    size="small"
                    shape="circle"
                    icon={<Dismiss12Regular />}
                    style={{ position: 'absolute', top: -6, right: -6, minWidth: 20, width: 20, height: 20 }}
                    onClick={() => void draft.removeImage(img.id)}
                    disabled={draft.sending}
                    aria-label={t('common.delete')}
                  />
                </div>
              ))}
              {draft.uploading.map((up) => (
                <div
                  key={up.id}
                  style={{
                    position: 'relative',
                    width: 56,
                    height: 56,
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={up.url}
                    alt={up.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
                  />
                  <Spin
                    size="small"
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}
                  />
                </div>
              ))}
            </Flex>
          ) : undefined
        }
        prefix={
          <Tooltip title={vision ? t('chat.attachImage') : t('chat.noVision')}>
            <Button
              type="text"
              icon={<Image20Regular />}
              aria-label={t('chat.attachImage')}
              disabled={!vision || !draft.ready || attachments >= 4 || draft.sending || Boolean(conflict)}
              onClick={() => fileRef.current?.click()}
            />
          </Tooltip>
        }
        // Sender only submits on Enter while its own SendButton reports "enabled", so the send button
        // must be the built-in one (a plain Button leaves Enter disabled for good).
        suffix={(_, { components: { SendButton } }) => (
          <Flex gap={4} align="center">
            {running && onStop && (
              <Tooltip title={t('chat.stop')}>
                <Button
                  shape="circle"
                  danger
                  icon={<Stop20Filled />}
                  onClick={onStop}
                  aria-label={t('chat.stop')}
                />
              </Tooltip>
            )}
            <SendButton
              icon={<Send20Filled />}
              loading={draft.sending}
              disabled={disabled || !draft.canSend}
              aria-label={t('chat.send')}
            />
          </Flex>
        )}
        footer={
          running ? (
            <Flex align="center" gap={8} style={{ padding: '0 12px 8px' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('chat.whileRunning')}
              </Typography.Text>
              <Segmented
                size="small"
                value={whenBusy}
                onChange={(v) => setWhenBusy(v as typeof whenBusy)}
                options={[
                  { value: 'steer', label: t('chat.steer') },
                  { value: 'followUp', label: t('chat.followUp') },
                ]}
              />
              {queued > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t('chat.queued', { count: queued })}
                </Typography.Text>
              )}
            </Flex>
          ) : undefined
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void draft.addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
