import { Alert24Regular } from '@fluentui/react-icons';
import type { Notification } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Badge, Button, Drawer, Empty, List, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../api/client.ts';
import { useTopic } from '../api/stream.ts';
import { RunDrawer } from '../pages/agents/RunsPanel.tsx';

const SEVERITY_COLOR = { info: '#0F6CBD', success: '#107C10', warning: '#DA3B01', error: '#C50F1F' } as const;

export function NotificationCenter() {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: Notification[]; unread: number }>('/notifications', { limit: 50 }),
  });
  useTopic<{ kind: string; notification?: Notification }>('notifications', (ev) => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    if (
      ev.kind === 'created' &&
      ev.notification &&
      (ev.notification.severity === 'error' || ev.notification.severity === 'warning')
    ) {
      notification[ev.notification.severity]({
        message: ev.notification.title,
        description: ev.notification.body,
        placement: 'bottomRight',
      });
    }
  });

  const go = (n: Notification) => {
    void api
      .post('/notifications/read', { ids: [n.id] })
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
    if (typeof n.data.runId === 'string') {
      setRunId(n.data.runId);
      setOpen(false);
      return;
    }
    const agentId = n.data.agentId as string | undefined;
    if (agentId) navigate(`/agents/${agentId}`);
    setOpen(false);
  };

  const markAll = async () => {
    await api.post('/notifications/read', { ids: 'all' });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <>
      <RunDrawer runId={runId} onClose={() => setRunId(null)} />
      <Tooltip title={t('notifications.title')} placement="right">
        <Badge count={q.data?.unread ?? 0} size="small" offset={[-6, 6]}>
          <Button
            type="text"
            icon={<Alert24Regular />}
            onClick={() => setOpen(true)}
            aria-label={t('notifications.title')}
            style={{ width: 44, height: 40 }}
          />
        </Badge>
      </Tooltip>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t('notifications.title')}
        width={400}
        extra={
          <Button size="small" onClick={() => void markAll()} disabled={!q.data?.unread}>
            {t('notifications.markAll')}
          </Button>
        }
      >
        {!q.data?.items.length ? (
          <Empty description={t('notifications.empty')} />
        ) : (
          <List
            dataSource={q.data.items}
            renderItem={(n) => (
              <List.Item onClick={() => go(n)} style={{ cursor: 'pointer', opacity: n.readAt ? 0.6 : 1 }}>
                <List.Item.Meta
                  avatar={
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: SEVERITY_COLOR[n.severity],
                        marginTop: 8,
                      }}
                    />
                  }
                  title={n.title}
                  description={
                    <>
                      <Typography.Paragraph
                        type="secondary"
                        style={{ marginBottom: 4 }}
                        ellipsis={{ rows: 3 }}
                      >
                        {n.body}
                      </Typography.Paragraph>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(n.createdAt).fromNow()}
                      </Typography.Text>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  );
}
