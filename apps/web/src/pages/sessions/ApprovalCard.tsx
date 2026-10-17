import { ShieldKeyhole20Regular } from '@fluentui/react-icons';
import type { Approval } from '@cangze/contracts';
import { App, Button, Card, Flex, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { errorText } from '../../lib/errors.ts';

export function ApprovalCard({ approval }: { approval: Approval }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const decide = async (approve: boolean) => {
    setBusy(approve ? 'yes' : 'no');
    try {
      await api.post(`/approvals/${approval.id}/decide`, { approve });
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card size="small" style={{ borderColor: '#F7630C', maxWidth: 560 }}>
      <Flex gap={12} align="flex-start">
        <ShieldKeyhole20Regular style={{ color: '#DA3B01', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Text strong>{t('chat.approvalTitle')}</Typography.Text>
          <Typography.Paragraph style={{ margin: '4px 0' }}>{approval.summary}</Typography.Paragraph>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('chat.approvalExpires', { time: dayjs(approval.expiresAt).format('HH:mm:ss') })}
          </Typography.Text>
          <Space style={{ display: 'flex', marginTop: 8 }}>
            <Button
              type="primary"
              size="small"
              loading={busy === 'yes'}
              disabled={busy !== null}
              onClick={() => void decide(true)}
            >
              {t('chat.approve')}
            </Button>
            <Button
              size="small"
              loading={busy === 'no'}
              disabled={busy !== null}
              onClick={() => void decide(false)}
            >
              {t('chat.deny')}
            </Button>
          </Space>
        </div>
      </Flex>
    </Card>
  );
}
