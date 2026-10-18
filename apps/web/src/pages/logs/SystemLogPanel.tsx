import type { SystemLogEntry } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { Flex, Input, Segmented, Switch, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';

const LEVEL_NAME: Record<number, [string, string]> = {
  10: ['trace', 'default'],
  20: ['debug', 'default'],
  30: ['info', 'blue'],
  40: ['warn', 'orange'],
  50: ['error', 'red'],
  60: ['fatal', 'magenta'],
};

export function SystemLogPanel() {
  const { t } = useTranslation();
  const [level, setLevel] = useState('info');
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(true);
  const q = useQuery({
    queryKey: ['logs', 'system', level, search],
    queryFn: () =>
      api.get<SystemLogEntry[]>('/logs/system', { level, search: search || undefined, limit: 500 }),
    refetchInterval: live ? 5000 : false,
  });
  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBottom: 12 }}>
        <Segmented
          value={level}
          onChange={(v) => setLevel(String(v))}
          options={['debug', 'info', 'warn', 'error'].map((l) => ({ value: l, label: l }))}
        />
        <Input.Search allowClear placeholder={t('logs.search')} style={{ width: 260 }} onSearch={setSearch} />
        <Flex gap={6} align="center">
          <Switch size="small" checked={live} onChange={setLive} />
          <Typography.Text type="secondary">{t('logs.live')}</Typography.Text>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('logs.memoryOnly')}
        </Typography.Text>
      </Flex>
      <Table<SystemLogEntry>
        size="small"
        rowKey={(r) => `${r.time}-${r.msg}`}
        loading={q.isLoading}
        dataSource={q.data ?? []}
        pagination={{ pageSize: 100, hideOnSinglePage: true }}
        expandable={{
          rowExpandable: (r) => Object.keys(r.data).length > 0,
          expandedRowRender: (r) => (
            <pre className="cz-mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(r.data, null, 2)}
            </pre>
          ),
        }}
        columns={[
          {
            title: t('logs.time'),
            dataIndex: 'time',
            width: 170,
            render: (v: number) => dayjs(v).format('MM-DD HH:mm:ss.SSS'),
          },
          {
            title: t('logs.level'),
            dataIndex: 'level',
            width: 90,
            render: (l: number) => <Tag color={LEVEL_NAME[l]?.[1]}>{LEVEL_NAME[l]?.[0] ?? l}</Tag>,
          },
          { title: t('logs.module'), dataIndex: 'module', width: 120 },
          { title: t('logs.message'), dataIndex: 'msg', ellipsis: true },
        ]}
      />
    </>
  );
}
