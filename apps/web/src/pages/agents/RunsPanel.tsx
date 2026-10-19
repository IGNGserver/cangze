import type { RunSummary } from '@cangze/contracts';
import { Alert, Button, Drawer, Descriptions, Flex, Select, Skeleton, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useRunHistory, useRunTranscript } from '../../api/agents.ts';
import { errorText } from '../../lib/errors.ts';
import { MessageList } from '../sessions/MessageList.tsx';
import { RunStatusTag } from './RunStatusTag.tsx';

export function RunsPanel({ agentId }: { agentId?: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | undefined>();
  const runs = useRunHistory({ agentId, status });
  const rows = [...new Map((runs.data?.pages.flat() ?? []).map((r) => [r.id, r])).values()];
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <Flex gap={8} style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder={t('agents.filterStatus')}
          style={{ width: 200 }}
          value={status}
          onChange={setStatus}
          options={(
            ['queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'aborted', 'skipped'] as const
          ).map((s) => ({ value: s, label: t(`agents.status.${s}`) }))}
        />
      </Flex>
      <Table<RunSummary>
        size="small"
        rowKey="id"
        loading={runs.isLoading}
        dataSource={rows}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => setOpen(r.id), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: t('agents.col.status'),
            dataIndex: 'status',
            width: 120,
            render: (s) => <RunStatusTag status={s} />,
          },
          ...(agentId ? [] : [{ title: t('agents.col.agent'), dataIndex: 'agentName' }]),
          {
            title: t('agents.col.queued'),
            dataIndex: 'queuedAt',
            width: 150,
            render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
          },
          {
            title: t('agents.col.trigger'),
            dataIndex: 'triggerKind',
            width: 120,
            render: (k: string) => t(`agents.triggerKinds.${k}`),
          },
          {
            title: t('agents.col.result'),
            render: (_: unknown, r: RunSummary) => (
              <Typography.Text type={r.error ? 'danger' : 'secondary'} ellipsis style={{ maxWidth: 420 }}>
                {r.error ?? r.summary ?? ''}
              </Typography.Text>
            ),
          },
        ]}
      />
      <RunDrawer runId={open} onClose={() => setOpen(null)} />
      {runs.error && <Alert type="error" message={errorText(t, runs.error)} />}
      {runs.hasNextPage && (
        <Button
          loading={runs.isFetchingNextPage}
          disabled={runs.isFetching}
          onClick={() => void runs.fetchNextPage()}
        >
          {t('agents.loadMoreRuns')}
        </Button>
      )}
    </>
  );
}

export function RunDrawer({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { state, data, loading } = useRunTranscript(runId);
  const run = data?.run;
  return (
    <Drawer
      open={Boolean(runId)}
      onClose={onClose}
      width={760}
      title={run ? `${run.agentName} · ${dayjs(run.queuedAt).format('YYYY-MM-DD HH:mm:ss')}` : ''}
      destroyOnHidden
    >
      {loading || !run ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={16} style={{ height: '100%' }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label={t('agents.col.status')}>
              <RunStatusTag status={run.status} />
            </Descriptions.Item>
            <Descriptions.Item label={t('agents.col.trigger')}>
              {t(`agents.triggerKinds.${run.triggerKind}`)}
              {run.triggerId ? ` (${run.triggerId})` : ''}
            </Descriptions.Item>
            <Descriptions.Item label={t('agents.revision')}>{run.revision}</Descriptions.Item>
            <Descriptions.Item label={t('chat.cost')}>
              {run.usage.costUnknown ? t('chat.costUnknown') : `$${(run.usage.cost ?? 0).toFixed(4)}`}
            </Descriptions.Item>
            {run.requestedBy && (
              <Descriptions.Item label={t('agents.requestedBy')}>{run.requestedBy}</Descriptions.Item>
            )}
            {run.error && (
              <Descriptions.Item label={t('agents.col.error')} span={2}>
                <Typography.Text type="danger">{run.error}</Typography.Text>
              </Descriptions.Item>
            )}
          </Descriptions>
          {(run.status === 'running' || run.status === 'queued' || run.status === 'waiting_approval') && (
            <Button danger onClick={() => void api.post(`/runs/${run.id}/abort`)}>
              {t('agents.abort')}
            </Button>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('agents.readOnlyTranscript')}
          </Typography.Text>
          <div style={{ flex: 1, minHeight: 300 }}>
            <MessageList sessionId={null} state={state} readOnly />
          </div>
        </Flex>
      )}
    </Drawer>
  );
}
