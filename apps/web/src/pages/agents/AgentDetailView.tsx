import { Play20Regular } from '@fluentui/react-icons';
import type { AgentDefinition, AgentDetail } from '@cangze/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Flex,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Switch,
  Tabs,
  theme,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api/client.ts';
import { ak, useAgent } from '../../api/agents.ts';
import { errorText } from '../../lib/errors.ts';
import { DefinitionForm } from './DefinitionForm.tsx';
import { MemoryPanel } from './MemoryPanel.tsx';
import { OverviewPanel } from './OverviewPanel.tsx';
import { PermissionsEditor } from './PermissionsEditor.tsx';
import { RevisionsPanel } from './RevisionsPanel.tsx';
import { RunsPanel } from './RunsPanel.tsx';
import { TriggersEditor } from './TriggersEditor.tsx';

export function AgentDetailView({ id }: { id: string }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const agent = useAgent(id);
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [tab, setTab] = useState('overview');
  const [runOpen, setRunOpen] = useState(false);
  const [task, setTask] = useState('');

  // Start editing from the latest saved revision unless there are unsaved edits.
  useEffect(() => {
    if (agent.data && (!draft || base === null)) {
      setDraft(agent.data.definition);
      setBase(agent.data.revision);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.data]);

  if (agent.isLoading || !agent.data || !draft) {
    return agent.error ? (
      <Alert type="error" message={errorText(t, agent.error)} style={{ margin: 24 }} />
    ) : (
      <Skeleton active style={{ padding: 24 }} />
    );
  }
  const a: AgentDetail = agent.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(a.definition) || base !== a.revision;
  const remoteChanged = base !== null && base !== a.revision;

  const update = (patch: Partial<AgentDefinition>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.put<AgentDetail>(`/agents/${id}`, { baseRevision: base, definition: draft });
      qc.setQueryData(ak.detail(id), next);
      setDraft(next.definition);
      setBase(next.revision);
      setConflict(false);
      void message.success(t('agents.saved', { rev: next.revision }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'revision_conflict') setConflict(true);
      else void message.error(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(a.definition);
    setBase(a.revision);
    setConflict(false);
  };

  const run = async () => {
    try {
      await api.post(`/agents/${id}/run`, { task: task || undefined });
      setRunOpen(false);
      setTask('');
      setTab('runs');
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const remove = async () => {
    try {
      await api.del(`/agents/${id}`);
      navigate('/agents');
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  return (
    <Flex vertical style={{ height: '100%' }}>
      <Flex
        align="center"
        gap={12}
        wrap
        style={{ padding: '12px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      >
        {!screens.lg && <Button onClick={() => navigate('/agents')}>{t('common.back')}</Button>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: 0 }} ellipsis>
            {a.name}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('agents.revisionInfo', { rev: a.revision, slug: a.slug })}
          </Typography.Text>
        </div>
        <Space wrap>
          <Popconfirm
            title={t('agents.emergencyStopHint')}
            onConfirm={() =>
              api.post(`/agents/${id}/stop`).catch((e) => {
                void message.error(errorText(t, e));
              })
            }
          >
            <Button danger>{t('agents.emergencyStop')}</Button>
          </Popconfirm>
          <Switch
            checkedChildren={t('agents.enabled')}
            unCheckedChildren={t('agents.disabled')}
            checked={a.enabled}
            onChange={(on) =>
              void api
                .post(`/agents/${id}/enabled`, { enabled: on })
                .then(() => qc.invalidateQueries({ queryKey: ['agents'] }))
            }
          />
          <Button icon={<Play20Regular />} onClick={() => setRunOpen(true)} disabled={a.running}>
            {t('agents.runNow')}
          </Button>
          <Popconfirm
            title={t('agents.deleteConfirm')}
            onConfirm={() => void remove()}
            okButtonProps={{ danger: true }}
          >
            <Button danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      </Flex>

      {(dirty || conflict) && (
        <Alert
          banner
          type={conflict || remoteChanged ? 'warning' : 'info'}
          message={
            conflict || remoteChanged ? t('agents.conflict', { rev: a.revision }) : t('agents.unsaved')
          }
          action={
            <Space>
              <Button size="small" onClick={discard}>
                {t('agents.discard')}
              </Button>
              {(conflict || remoteChanged) && (
                <Button
                  size="small"
                  onClick={() => {
                    setBase(a.revision);
                    setConflict(false);
                  }}
                >
                  {t('agents.keepMine')}
                </Button>
              )}
              {!(conflict || remoteChanged) && (
                <Button size="small" type="primary" loading={saving} onClick={() => void save()}>
                  {t('common.save')}
                </Button>
              )}
            </Space>
          }
        />
      )}

      <Tabs
        activeKey={tab}
        onChange={setTab}
        style={{ flex: 1, minHeight: 0, padding: '0 20px' }}
        className="cz-tabs-fill"
        items={[
          {
            key: 'overview',
            label: t('agents.tabs.overview'),
            children: <OverviewPanel agent={a} onOpenRuns={() => setTab('runs')} />,
          },
          {
            key: 'definition',
            label: t('agents.tabs.definition'),
            children: <DefinitionForm value={draft} onChange={update} />,
          },
          {
            key: 'permissions',
            label: t('agents.tabs.permissions'),
            children: (
              <PermissionsEditor value={draft.permissions} highRisk={draft.highRisk} onChange={update} />
            ),
          },
          {
            key: 'triggers',
            label: t('agents.tabs.triggers'),
            children: (
              <TriggersEditor
                agentId={id}
                value={draft.triggers}
                states={a.triggers}
                limits={draft.limits}
                onChange={update}
                dirty={dirty}
              />
            ),
          },
          { key: 'memory', label: t('agents.tabs.memory'), children: <MemoryPanel agentId={id} /> },
          { key: 'runs', label: t('agents.tabs.runs'), children: <RunsPanel agentId={id} /> },
          {
            key: 'revisions',
            label: t('agents.tabs.revisions'),
            children: (
              <RevisionsPanel
                agentId={id}
                current={a.revision}
                onRestore={(def) => {
                  setDraft(def);
                  setBase(a.revision);
                  setTab('definition');
                }}
              />
            ),
          },
        ]}
      />

      <Modal
        open={runOpen}
        title={t('agents.runNow')}
        onCancel={() => setRunOpen(false)}
        onOk={() => void run()}
        okText={t('agents.run')}
      >
        <Typography.Paragraph type="secondary">{t('agents.runHint')}</Typography.Paragraph>
        <Input.TextArea
          autoSize={{ minRows: 3 }}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={t('agents.taskPlaceholder')}
        />
      </Modal>
    </Flex>
  );
}
