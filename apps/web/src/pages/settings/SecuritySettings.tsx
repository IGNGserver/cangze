import type { SecuritySettings as Sec, WebSession } from '@cangze/contracts';
import { PUBLIC_HTTP_CONFIRMATION } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  List,
  Modal,
  Select,
  Switch,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { qk } from '../../api/queries.ts';
import { errorText } from '../../lib/errors.ts';
import { Section } from './Section.tsx';

export function SecuritySettings() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const sec = useQuery({ queryKey: qk.security, queryFn: () => api.get<Sec>('/settings/security') });
  const sessions = useQuery({
    queryKey: qk.webSessions,
    queryFn: () => api.get<WebSession[]>('/auth/sessions'),
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phrase, setPhrase] = useState('');

  const patch = async (body: Record<string, unknown>) => {
    try {
      const next = await api.patch<Sec>('/settings/security', body);
      qc.setQueryData(qk.security, next);
      return true;
    } catch (e) {
      void message.error(errorText(t, e));
      return false;
    }
  };

  const enablePublic = async () => {
    if (await patch({ allowPublicHttp: true, confirmation: phrase })) {
      setConfirmOpen(false);
      setPhrase('');
    }
  };

  const changeKey = async (v: { currentKey: string; newKey: string; revokeDevices: boolean }) => {
    try {
      await api.post('/auth/admin-key', v);
      void message.success(t('settings.security.keyChanged'));
      await qc.invalidateQueries({ queryKey: qk.webSessions });
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const s = sec.data;
  return (
    <>
      <Section title={t('settings.security.network')} description={t('settings.security.networkHint')}>
        {s && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t('settings.security.yourAddress')}>
                {s.request.ip} · {s.request.protocol.toUpperCase()}{' '}
                <Tag color={s.request.private ? 'green' : 'orange'}>
                  {s.request.private ? t('settings.security.private') : t('settings.security.public')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('settings.security.publicOrigin')}>
                {s.publicOrigin ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('settings.security.trustedProxies')}>
                {s.trustedProxies.join(', ') || '—'}
              </Descriptions.Item>
            </Descriptions>
            {s.allowPublicHttp && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('settings.security.publicHttpOn')}
              />
            )}
            <Form layout="vertical">
              <Form.Item
                label={t('settings.security.allowPublicHttp')}
                extra={t('settings.security.allowPublicHttpHint')}
              >
                <Switch
                  checked={s.allowPublicHttp}
                  onChange={(on) => (on ? setConfirmOpen(true) : void patch({ allowPublicHttp: false }))}
                />
              </Form.Item>
              <Form.Item
                label={t('settings.security.allowedHosts')}
                extra={t('settings.security.allowedHostsHint')}
              >
                <Select
                  mode="tags"
                  value={s.allowedHosts}
                  onChange={(v: string[]) => void patch({ allowedHosts: v })}
                  tokenSeparators={[',', ' ']}
                  placeholder="hub.example.lan"
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Section>
      <Section title={t('settings.security.adminKey')}>
        <Form
          layout="vertical"
          onFinish={(v) => void changeKey(v)}
          initialValues={{ revokeDevices: false }}
          requiredMark={false}
        >
          <Form.Item name="currentKey" label={t('settings.security.currentKey')} rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newKey"
            label={t('settings.security.newKey')}
            rules={[{ required: true, min: 12, message: t('auth.adminKeyMin', { n: 12 }) }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="revokeDevices"
            valuePropName="checked"
            label={t('settings.security.revokeDevices')}
          >
            <Switch />
          </Form.Item>
          <Button htmlType="submit">{t('settings.security.changeKey')}</Button>
        </Form>
      </Section>
      <Section title={t('settings.security.sessions')}>
        <List
          dataSource={sessions.data ?? []}
          renderItem={(item) => (
            <List.Item
              actions={
                item.current
                  ? [<Tag key="c">{t('settings.security.thisSession')}</Tag>]
                  : [
                      <Button
                        key="r"
                        size="small"
                        onClick={() =>
                          void api
                            .del(`/auth/sessions/${item.id}`)
                            .then(() => qc.invalidateQueries({ queryKey: qk.webSessions }))
                        }
                      >
                        {t('settings.security.signOut')}
                      </Button>,
                    ]
              }
            >
              <List.Item.Meta
                title={
                  <Typography.Text ellipsis>
                    {item.userAgent ?? t('settings.security.unknownBrowser')}
                  </Typography.Text>
                }
                description={`${item.ip ?? ''} · ${t('settings.security.lastSeen', { when: dayjs(item.lastSeenAt).format('YYYY-MM-DD HH:mm') })}`}
              />
            </List.Item>
          )}
        />
      </Section>
      <Modal
        open={confirmOpen}
        title={t('settings.security.publicHttpTitle')}
        okText={t('settings.security.enable')}
        okButtonProps={{ danger: true, disabled: phrase !== PUBLIC_HTTP_CONFIRMATION }}
        onOk={() => void enablePublic()}
        onCancel={() => setConfirmOpen(false)}
      >
        <Typography.Paragraph>{t('settings.security.publicHttpRisk')}</Typography.Paragraph>
        <Typography.Paragraph>
          {t('settings.security.typePhrase')}{' '}
          <Typography.Text code>{PUBLIC_HTTP_CONFIRMATION}</Typography.Text>
        </Typography.Paragraph>
        <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} />
      </Modal>
    </>
  );
}
