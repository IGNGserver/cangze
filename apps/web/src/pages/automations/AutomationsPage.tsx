import { isHaConfigDomain, type Approval, type HaConfigKind, type HaEntity } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Badge,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Grid,
  List,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useUpcoming } from '../../api/agents.ts';
import { api } from '../../api/client.ts';
import { useCallService, useHaConfigDetail, useLiveEntities } from '../../api/ha.ts';
import { useEntities } from '../../api/queries.ts';
import { useTopic } from '../../api/stream.ts';
import { Page } from '../../components/Page.tsx';
import { errorText } from '../../lib/errors.ts';
import { RunsPanel } from '../agents/RunsPanel.tsx';
import { ApprovalCard } from '../sessions/ApprovalCard.tsx';

export function AutomationsPage() {
  const { t } = useTranslation();
  const approvals = usePendingApprovals();
  return (
    <Page title={t('nav.automations')} subtitle={t('automations.subtitle')}>
      <Tabs
        items={[
          { key: 'schedule', label: t('automations.tabs.schedule'), children: <Schedule /> },
          { key: 'runs', label: t('automations.tabs.runs'), children: <RunsPanel /> },
          {
            key: 'approvals',
            label: (
              <Space size={6}>
                {t('automations.tabs.approvals')}
                {approvals.data && approvals.data.length > 0 && <Badge count={approvals.data.length} />}
              </Space>
            ),
            children: <Approvals list={approvals.data ?? []} />,
          },
          { key: 'ha', label: t('automations.tabs.ha'), children: <HaConfigs /> },
        ]}
      />
    </Page>
  );
}

function usePendingApprovals() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<Approval[]>('/approvals', { status: 'pending' }),
  });
  useTopic('approvals', () => void qc.invalidateQueries({ queryKey: ['approvals'] }));
  return q;
}

function Schedule() {
  const { t } = useTranslation();
  const upcoming = useUpcoming();
  if (!upcoming.data?.length) return <Empty description={t('automations.noSchedule')} />;
  return (
    <Timeline
      items={upcoming.data.map((u) => ({
        children: (
          <div>
            <Typography.Text strong>{dayjs(u.at).format('MM-DD ddd HH:mm')}</Typography.Text>{' '}
            <Typography.Text type="secondary">({dayjs(u.at).fromNow()})</Typography.Text>
            <div>
              <Link to={`/agents/${u.agentId}`}>{u.agentName}</Link> · {u.triggerName}{' '}
              <Tag>{t(`agents.triggerKinds.${u.kind}`)}</Tag>
            </div>
          </div>
        ),
      }))}
    />
  );
}

function Approvals({ list }: { list: Approval[] }) {
  const { t } = useTranslation();
  if (!list.length) return <Empty description={t('automations.noApprovals')} />;
  return (
    <List
      dataSource={list}
      renderItem={(a) => (
        <List.Item>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {a.agentId ? (
                <Link to={`/agents/${a.agentId}`}>{a.principal}</Link>
              ) : a.sessionId ? (
                <Link to={`/sessions/${a.sessionId}`}>{a.principal}</Link>
              ) : (
                a.principal
              )}{' '}
              · {dayjs(a.createdAt).format('HH:mm:ss')}
            </Typography.Text>
            <ApprovalCard approval={a} />
          </Space>
        </List.Item>
      )}
    />
  );
}

const KIND_ORDER: Record<string, number> = { automation: 0, scene: 1, script: 2 };

function configIdForEntity(entity: HaEntity): string | null {
  const id = entity.attributes.id;
  if (typeof id === 'string' && id.trim()) return id;
  const separator = entity.entity_id.indexOf('.');
  const suffix = separator >= 0 ? entity.entity_id.slice(separator + 1) : '';
  return suffix || null;
}

function HaConfigs() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [selected, setSelected] = useState<{ kind: HaConfigKind; configId: string; name: string } | null>(
    null,
  );
  useLiveEntities();
  const entities = useEntities();
  const call = useCallService();
  const configs = (entities.data ?? [])
    .filter((e) => isHaConfigDomain(e.domain))
    .sort(
      (a, b) => (KIND_ORDER[a.domain] ?? 99) - (KIND_ORDER[b.domain] ?? 99) || a.name.localeCompare(b.name),
    );
  const run = (domain: string, service: string, entity: string) =>
    call.mutate(
      { domain, service, target: { entity_id: entity } },
      { onError: (e) => void message.error(errorText(t, e)) },
    );
  const lastUsed = (e: HaEntity) => {
    const raw =
      e.attributes.last_triggered ?? e.attributes.last_activated ?? (e.domain === 'scene' ? e.state : null);
    if (typeof raw !== 'string' || !raw || raw === 'unknown' || raw === 'unavailable') return '—';
    const d = dayjs(raw);
    return d.isValid() ? d.format('MM-DD HH:mm') : '—';
  };
  return (
    <>
      <Table<HaEntity>
        size="small"
        rowKey="entity_id"
        dataSource={configs}
        locale={{ emptyText: t('automations.noHa') }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        onRow={(e) => {
          const configId = configIdForEntity(e);
          return {
            onClick: () => {
              if (configId) setSelected({ kind: e.domain as HaConfigKind, configId, name: e.name });
            },
            style: { cursor: configId ? 'pointer' : 'default' },
          };
        }}
        columns={[
          {
            title: t('automations.col.type'),
            width: 100,
            render: (_, e) => <Tag>{t(`automations.kind.${e.domain}`)}</Tag>,
          },
          { title: t('automations.col.name'), dataIndex: 'name' },
          {
            title: t('automations.col.enabled'),
            width: 100,
            render: (_, e) =>
              e.domain === 'automation' ? (
                <span onClick={(event) => event.stopPropagation()}>
                  <Switch
                    size="small"
                    checked={e.state === 'on'}
                    onChange={(on) => run('automation', on ? 'turn_on' : 'turn_off', e.entity_id)}
                  />
                </span>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
          {
            title: t('automations.col.last'),
            width: 150,
            render: (_, e) => lastUsed(e),
          },
          {
            title: '',
            width: 120,
            render: (_, e) => {
              const action =
                e.domain === 'automation'
                  ? { service: 'trigger', label: t('automations.trigger') }
                  : e.domain === 'scene'
                    ? { service: 'turn_on', label: t('automations.activate') }
                    : { service: 'turn_on', label: t('automations.run') };
              return (
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    run(e.domain, action.service, e.entity_id);
                  }}
                >
                  {action.label}
                </Button>
              );
            },
          },
        ]}
      />
      <HaConfigDrawer selected={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function HaConfigDrawer({
  selected,
  onClose,
}: {
  selected: { kind: HaConfigKind; configId: string; name: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const detail = useHaConfigDetail(selected?.kind ?? null, selected?.configId ?? null);
  const title = selected
    ? `${selected.name} · ${t(`automations.kind.${selected.kind}`)}`
    : t('automations.detail.title');
  return (
    <Drawer
      open={Boolean(selected)}
      onClose={onClose}
      title={title}
      width={screens.md ? 680 : '100%'}
      destroyOnHidden
    >
      {detail.isLoading ? (
        <Skeleton active />
      ) : detail.error ? (
        <Alert
          type="error"
          showIcon
          message={t('automations.detail.error')}
          description={errorText(t, detail.error)}
          action={
            <Button size="small" onClick={() => void detail.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : detail.data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label={t('automations.detail.type')}>
              {t(`automations.kind.${detail.data.kind}`)}
            </Descriptions.Item>
            <Descriptions.Item label={t('automations.detail.configId')}>
              <Typography.Text copyable className="cz-mono">
                {detail.data.configId}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Typography.Text strong>{t('automations.detail.json')}</Typography.Text>
            <pre
              className="cz-code-block cz-mono"
              style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {JSON.stringify(detail.data.config, null, 2)}
            </pre>
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
