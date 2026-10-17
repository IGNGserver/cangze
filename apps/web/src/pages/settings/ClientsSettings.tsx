import type { DeviceToken } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  QRCode,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { qk } from '../../api/queries.ts';
import { errorText } from '../../lib/errors.ts';
import { Section } from './Section.tsx';

export function ClientsSettings() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: qk.deviceTokens,
    queryFn: () => api.get<DeviceToken[]>('/auth/devices'),
  });
  const [pairing, setPairing] = useState<{ code: string; uri: string; deadline: number } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.deviceTokens });

  const startPairing = async () => {
    try {
      const res = await api.post<{ code: string; uri: string; ttlSeconds: number }>('/auth/pairing');
      setPairing({ code: res.code, uri: res.uri, deadline: Date.now() + res.ttlSeconds * 1000 });
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const create = async (v: { name: string; platform: string }) => {
    try {
      const res = await api.post<{ token: string }>('/auth/devices', v);
      setCreated(res.token);
      setCreating(false);
      void refresh();
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  return (
    <Section
      title={t('settings.clients.title')}
      description={t('settings.clients.hint')}
      extra={
        <Space>
          <Button onClick={() => setCreating(true)}>{t('settings.clients.createToken')}</Button>
          <Button type="primary" onClick={() => void startPairing()}>
            {t('settings.clients.pair')}
          </Button>
        </Space>
      }
    >
      <List
        dataSource={devices.data ?? []}
        locale={{ emptyText: t('settings.clients.empty') }}
        renderItem={(d) => (
          <List.Item
            actions={[
              !d.revoked && (
                <Popconfirm
                  key="r"
                  title={t('settings.clients.revokeConfirm')}
                  onConfirm={() => void api.post(`/auth/devices/${d.id}/revoke`).then(refresh)}
                >
                  <Button size="small">{t('settings.clients.revoke')}</Button>
                </Popconfirm>
              ),
              <Popconfirm
                key="d"
                title={t('settings.clients.deleteConfirm')}
                onConfirm={() => void api.del(`/auth/devices/${d.id}`).then(refresh)}
              >
                <Button size="small" danger>
                  {t('common.delete')}
                </Button>
              </Popconfirm>,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={
                <Space>
                  {d.name}
                  <Tag>{d.platform}</Tag>
                  {d.revoked && <Tag color="red">{t('settings.clients.revoked')}</Tag>}
                </Space>
              }
              description={
                d.lastUsedAt
                  ? t('settings.clients.lastUsed', {
                      when: dayjs(d.lastUsedAt).format('YYYY-MM-DD HH:mm'),
                      ip: d.lastIp ?? '',
                    })
                  : t('settings.clients.neverUsed')
              }
            />
          </List.Item>
        )}
      />
      <PairingModal
        pairing={pairing}
        onClose={() => {
          setPairing(null);
          void refresh();
        }}
      />
      <Modal
        open={creating}
        title={t('settings.clients.createToken')}
        footer={null}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Form layout="vertical" onFinish={(v) => void create(v)} initialValues={{ platform: 'other' }}>
          <Form.Item name="name" label={t('settings.clients.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="platform" label={t('settings.clients.platform')}>
            <Select
              options={['android', 'ios', 'desktop', 'cli', 'other'].map((p) => ({ value: p, label: p }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            {t('common.create')}
          </Button>
        </Form>
      </Modal>
      <Modal
        open={Boolean(created)}
        title={t('settings.clients.tokenCreated')}
        onOk={() => setCreated(null)}
        onCancel={() => setCreated(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Typography.Paragraph type="secondary">{t('settings.clients.tokenOnce')}</Typography.Paragraph>
        <Typography.Paragraph copyable className="cz-mono">
          {created}
        </Typography.Paragraph>
      </Modal>
    </Section>
  );
}

function PairingModal({
  pairing,
  onClose,
}: {
  pairing: { code: string; uri: string; deadline: number } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!pairing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pairing]);
  const left = pairing ? Math.max(0, Math.round((pairing.deadline - now) / 1000)) : 0;
  return (
    <Modal
      open={Boolean(pairing)}
      title={t('settings.clients.pair')}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
    >
      {pairing && (
        <Flex vertical align="center" gap={12}>
          <QRCode value={pairing.uri} size={220} status={left === 0 ? 'expired' : 'active'} />
          <Typography.Title level={3} className="cz-mono" style={{ margin: 0, letterSpacing: 2 }}>
            {pairing.code}
          </Typography.Title>
          <Typography.Text type="secondary">{t('settings.clients.expiresIn', { s: left })}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
            {t('settings.clients.pairHint')}
          </Typography.Paragraph>
        </Flex>
      )}
    </Modal>
  );
}
