import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Radio, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client.ts';
import { qk } from '../api/queries.ts';
import { errorText } from '../lib/errors.ts';
import { AuthLayout } from './AuthLayout.tsx';

export function SetupPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'choose' | 'generate'>('choose');
  const [generated, setGenerated] = useState<string | null>(null);

  const submit = async (v: { bootstrapCode: string; adminKey?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ generatedAdminKey: string | null }>('/setup', {
        bootstrapCode: v.bootstrapCode,
        ...(mode === 'choose' ? { adminKey: v.adminKey } : {}),
      });
      if (res.generatedAdminKey) setGenerated(res.generatedAdminKey);
      else await qc.invalidateQueries({ queryKey: qk.auth });
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'invalid_bootstrap_code' ? t('setup.wrongCode') : errorText(t, e),
      );
    } finally {
      setLoading(false);
    }
  };

  if (generated) {
    return (
      <AuthLayout title={t('setup.generatedTitle')} subtitle={t('setup.generatedHint')}>
        <Typography.Paragraph copyable={{ text: generated }} className="cz-mono" style={{ fontSize: 16 }}>
          {generated}
        </Typography.Paragraph>
        <Button
          type="primary"
          block
          size="large"
          onClick={() => void qc.invalidateQueries({ queryKey: qk.auth })}
        >
          {t('setup.savedContinue')}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('setup.title')} subtitle={t('setup.hint')}>
      <Form layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item
          name="bootstrapCode"
          label={t('setup.code')}
          extra={<span className="cz-mono">docker compose logs cangze | grep -i bootstrap</span>}
          rules={[{ required: true, message: t('setup.codeRequired') }]}
        >
          <Input autoFocus size="large" placeholder="XXXX-XXXX-XXXX" className="cz-mono" />
        </Form.Item>
        <Form.Item label={t('setup.keyMode')}>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <Radio value="choose">{t('setup.chooseKey')}</Radio>
            <Radio value="generate">{t('setup.generateKey')}</Radio>
          </Radio.Group>
        </Form.Item>
        {mode === 'choose' && (
          <>
            <Form.Item
              name="adminKey"
              label={t('auth.adminKey')}
              rules={[
                { required: true, message: t('auth.adminKeyRequired') },
                { min: 12, message: t('auth.adminKeyMin', { n: 12 }) },
              ]}
            >
              <Input.Password autoComplete="new-password" size="large" />
            </Form.Item>
            <Form.Item
              name="confirm"
              label={t('setup.confirmKey')}
              dependencies={['adminKey']}
              rules={[
                { required: true, message: t('auth.adminKeyRequired') },
                ({ getFieldValue }) => ({
                  validator: (_r, v) =>
                    v === getFieldValue('adminKey')
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('setup.mismatch'))),
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" size="large" />
            </Form.Item>
          </>
        )}
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" block size="large" loading={loading}>
          {t('setup.submit')}
        </Button>
      </Form>
    </AuthLayout>
  );
}
