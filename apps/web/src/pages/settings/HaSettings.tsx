import type { HaStatus } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Descriptions, Form, Input, Popconfirm, Space, Switch } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { qk, useHaStatus } from '../../api/queries.ts';
import { errorText } from '../../lib/errors.ts';
import { Section } from './Section.tsx';

interface HaSettingsView {
  url: string | null;
  verifyTls: boolean;
  hasToken: boolean;
  tokenHint: string | null;
}

interface FormValues {
  url: string;
  token?: string;
  verifyTls: boolean;
}

export function HaSettings() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const status = useHaStatus();
  const settings = useQuery({
    queryKey: qk.haSettings,
    queryFn: () => api.get<HaSettingsView>('/settings/ha'),
  });
  const [form] = Form.useForm<FormValues>();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error: string | null;
    haVersion: string | null;
    locationName: string | null;
    user: { name: string; isAdmin: boolean } | null;
  } | null>(null);

  const values = () => {
    const v = form.getFieldsValue();
    return { url: v.url, verifyTls: v.verifyTls ?? true, ...(v.token ? { token: v.token } : {}) };
  };

  const test = async () => {
    await form.validateFields(['url']);
    setTesting(true);
    try {
      setTestResult(await api.post('/settings/ha/test', values()));
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    await form.validateFields();
    setSaving(true);
    try {
      await api.put<HaStatus>('/settings/ha', values());
      form.setFieldValue('token', undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.haSettings }),
        qc.invalidateQueries({ queryKey: ['ha'] }),
      ]);
      void message.success(t('settings.ha.saved'));
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    await api.del('/settings/ha');
    await qc.invalidateQueries({ queryKey: ['ha'] });
  };

  const s = status.data;
  const badge =
    s?.state === 'connected'
      ? 'success'
      : s?.state === 'connecting'
        ? 'processing'
        : s?.state === 'unconfigured'
          ? 'default'
          : 'error';

  return (
    <>
      <Section title={t('settings.ha.status')}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('settings.ha.state')}>
            <Badge status={badge} text={t(`ha.state.${s?.state ?? 'unconfigured'}`)} />
          </Descriptions.Item>
          {s?.error && <Descriptions.Item label={t('settings.ha.error')}>{s.error}</Descriptions.Item>}
          {s?.haVersion && (
            <Descriptions.Item label={t('settings.about.haVersion')}>{s.haVersion}</Descriptions.Item>
          )}
          {s?.locationName && (
            <Descriptions.Item label={t('settings.ha.location')}>{s.locationName}</Descriptions.Item>
          )}
          {s?.timeZone && (
            <Descriptions.Item label={t('settings.ha.timeZone')}>{s.timeZone}</Descriptions.Item>
          )}
          {s?.user && (
            <Descriptions.Item label={t('settings.ha.user')}>
              {s.user.name} · {s.user.isAdmin ? t('settings.ha.admin') : t('settings.ha.nonAdmin')}
            </Descriptions.Item>
          )}
          {s?.state === 'connected' && (
            <Descriptions.Item label={t('settings.ha.entities')}>{s.entityCount}</Descriptions.Item>
          )}
        </Descriptions>
        {s?.user && !s.user.isAdmin && (
          <Alert type="info" showIcon style={{ marginTop: 12 }} message={t('settings.ha.nonAdminHint')} />
        )}
      </Section>
      <Section title={t('settings.ha.connection')} description={t('settings.ha.connectionHint')}>
        {settings.data && (
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ url: settings.data.url ?? '', verifyTls: settings.data.verifyTls }}
          >
            <Form.Item
              name="url"
              label={t('settings.ha.url')}
              extra={t('settings.ha.urlHint')}
              rules={[{ required: true, type: 'url', message: t('settings.ha.urlRequired') }]}
            >
              <Input placeholder="http://192.168.1.10:8123" />
            </Form.Item>
            <Form.Item
              name="token"
              label={t('settings.ha.token')}
              extra={
                settings.data.hasToken
                  ? t('settings.ha.tokenKeep', { hint: settings.data.tokenHint })
                  : t('settings.ha.tokenHint')
              }
              rules={
                settings.data.hasToken ? [] : [{ required: true, message: t('settings.ha.tokenRequired') }]
              }
            >
              <Input.Password autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="verifyTls"
              label={t('settings.ha.verifyTls')}
              valuePropName="checked"
              extra={t('settings.ha.verifyTlsHint')}
            >
              <Switch />
            </Form.Item>
            {testResult && (
              <Alert
                style={{ marginBottom: 16 }}
                type={testResult.ok ? 'success' : 'error'}
                showIcon
                message={
                  testResult.ok
                    ? t('settings.ha.testOk', {
                        location: testResult.locationName,
                        version: testResult.haVersion,
                      })
                    : testResult.error
                }
              />
            )}
            <Space wrap>
              <Button onClick={() => void test()} loading={testing}>
                {t('settings.ha.test')}
              </Button>
              <Button type="primary" onClick={() => void save()} loading={saving}>
                {t('settings.ha.saveConnect')}
              </Button>
              {settings.data.url && (
                <Popconfirm title={t('settings.ha.disconnectConfirm')} onConfirm={() => void disconnect()}>
                  <Button danger>{t('settings.ha.disconnect')}</Button>
                </Popconfirm>
              )}
            </Space>
          </Form>
        )}
      </Section>
    </>
  );
}
