import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client.ts';
import { qk } from '../api/queries.ts';
import { errorText } from '../lib/errors.ts';
import { AuthLayout } from './AuthLayout.tsx';

export function LoginPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (v: { adminKey: string }) => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/login', { adminKey: v.adminKey });
      await qc.invalidateQueries({ queryKey: qk.auth });
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'invalid_admin_key' ? t('auth.wrongKey') : errorText(t, e),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginHint')}>
      <Form layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item
          name="adminKey"
          label={t('auth.adminKey')}
          rules={[{ required: true, message: t('auth.adminKeyRequired') }]}
        >
          <Input.Password autoFocus autoComplete="current-password" size="large" />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" block size="large" loading={loading}>
          {t('auth.login')}
        </Button>
      </Form>
    </AuthLayout>
  );
}
