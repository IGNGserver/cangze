import { Sender } from '@ant-design/x';
import { Dismiss12Regular, Image20Regular, Send20Filled, Stop20Filled } from '@fluentui/react-icons';
import { App, Button, Flex, Segmented, Tooltip, Typography } from 'antd';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { errorText } from '../../lib/errors.ts';
import { downscaleImage } from '../../lib/images.ts';

interface Img {
  mimeType: string;
  data: string;
}

export function Composer({
  sessionId,
  running,
  queued,
  vision,
  onSent,
}: {
  sessionId: string;
  running: boolean;
  queued: number;
  vision: boolean;
  onSent?: () => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [images, setImages] = useState<Img[]>([]);
  const [whenBusy, setWhenBusy] = useState<'steer' | 'followUp'>('steer');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 4 - images.length);
    try {
      const out = await Promise.all(list.map((f) => downscaleImage(f)));
      setImages((prev) => [...prev, ...out].slice(0, 4));
    } catch {
      void message.error(t('chat.imageFailed'));
    }
  };

  const send = async (value: string) => {
    if (!value.trim() && !images.length) return;
    setSending(true);
    try {
      await api.post(`/sessions/${sessionId}/messages`, { text: value, images, whenBusy });
      setText('');
      setImages([]);
      onSent?.();
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setSending(false);
    }
  };

  const stop = () => void api.post(`/sessions/${sessionId}/abort`).catch(() => undefined);

  return (
    <div>
      <Sender
        value={text}
        onChange={(v) => setText(v)}
        onSubmit={(v) => void send(v)}
        onPasteFile={(files) => vision && void addFiles(files)}
        autoSize={{ minRows: 1, maxRows: 8 }}
        placeholder={running ? t('chat.placeholderBusy') : t('chat.placeholder')}
        header={
          images.length > 0 ? (
            <Flex gap={8} wrap style={{ padding: '8px 12px 0' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt=""
                    style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }}
                  />
                  <Button
                    size="small"
                    shape="circle"
                    icon={<Dismiss12Regular />}
                    style={{ position: 'absolute', top: -6, right: -6, minWidth: 20, width: 20, height: 20 }}
                    onClick={() => setImages((prev) => prev.filter((_, k) => k !== i))}
                    aria-label={t('common.delete')}
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
              disabled={!vision || images.length >= 4}
              onClick={() => fileRef.current?.click()}
            />
          </Tooltip>
        }
        suffix={
          <Flex gap={4} align="center">
            {running && (
              <Tooltip title={t('chat.stop')}>
                <Button
                  shape="circle"
                  danger
                  icon={<Stop20Filled />}
                  onClick={stop}
                  aria-label={t('chat.stop')}
                />
              </Tooltip>
            )}
            <Button
              type="primary"
              shape="circle"
              icon={<Send20Filled />}
              loading={sending}
              disabled={!text.trim() && !images.length}
              onClick={() => void send(text)}
              aria-label={t('chat.send')}
            />
          </Flex>
        }
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
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
