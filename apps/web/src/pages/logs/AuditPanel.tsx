import type { AuditEntry } from '@cangze/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, Flex, Input, Select, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';

const DECISION_COLOR: Record<string, string> = {
  allowed: 'green',
  denied: 'red',
  conflict: 'orange',
  approved: 'blue',
  rejected: 'red',
  error: 'volcano',
};

export function AuditPanel() {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<string | undefined>();
  const [entityId, setEntityId] = useState('');
  const [principal, setPrincipal] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['audit', decision, entityId, principal],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api.get<AuditEntry[]>('/audit', {
        decision,
        entityId: entityId || undefined,
        principal: principal || undefined,
        before: pageParam,
        limit: 100,
      }),
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]!.id : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];

  return (
    <>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder={t('logs.decision')}
          style={{ width: 160 }}
          value={decision}
          onChange={setDecision}
          options={['allowed', 'denied', 'conflict', 'approved', 'rejected', 'error'].map((d) => ({
            value: d,
            label: t(`logs.decisions.${d}`),
          }))}
        />
        <Input.Search
          allowClear
          placeholder={t('logs.entity')}
          style={{ width: 220 }}
          onSearch={setEntityId}
        />
        <Input.Search
          allowClear
          placeholder={t('logs.principal')}
          style={{ width: 260 }}
          onSearch={setPrincipal}
        />
      </Flex>
      <Table<AuditEntry>
        size="small"
        rowKey="id"
        loading={q.isLoading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        expandable={{
          expandedRowRender: (r) => (
            <pre className="cz-mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(
                {
                  args: r.args,
                  result: r.result,
                  reason: r.reason,
                  haContextId: r.haContextId,
                  runId: r.runId,
                  sessionId: r.sessionId,
                },
                null,
                2,
              )}
            </pre>
          ),
        }}
        columns={[
          {
            title: t('logs.time'),
            dataIndex: 'ts',
            width: 160,
            render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
          },
          { title: t('logs.principal'), dataIndex: 'principal', width: 220, ellipsis: true },
          { title: t('logs.action'), dataIndex: 'action', width: 260, ellipsis: true },
          { title: t('logs.target'), dataIndex: 'target', ellipsis: true },
          {
            title: t('logs.decision'),
            dataIndex: 'decision',
            width: 110,
            render: (d: string) => <Tag color={DECISION_COLOR[d]}>{t(`logs.decisions.${d}`)}</Tag>,
          },
          {
            title: t('logs.reason'),
            dataIndex: 'reason',
            ellipsis: true,
            render: (v: string | null) => <Typography.Text type="secondary">{v ?? ''}</Typography.Text>,
          },
        ]}
      />
      {q.hasNextPage && (
        <Button
          block
          style={{ marginTop: 12 }}
          loading={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {t('logs.more')}
        </Button>
      )}
    </>
  );
}
