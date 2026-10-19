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
  Radio,
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
import { mergeJson, sameJson } from '../../lib/merge.ts';
import { parseJsonObject } from '../../lib/json.ts';
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
  const [baseDefinition, setBaseDefinition] = useState<AgentDefinition | null>(null);
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [mergeRemote, setMergeRemote] = useState<AgentDetail | null>(null);
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({});
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
      setBaseDefinition(agent.data.definition);
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
  const invalidJson = draft.triggers.some(
    (tr) =>
      (tr.kind === 'ha_event' || tr.kind === 'ha_trigger') &&
      jsonDrafts[tr.id] !== undefined &&
      !parseJsonObject(jsonDrafts[tr.id]!).ok,
  );
  const dirty = !sameJson(draft, a.definition) || base !== a.revision || invalidJson;
  const remoteChanged = base !== null && base !== a.revision;
  const merge =
    mergeRemote && baseDefinition ? mergeJson(baseDefinition, draft, mergeRemote.definition, choices) : null;

  const update = (patch: Partial<AgentDefinition>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (invalidJson || remoteChanged) return;
    setSaving(true);
    try {
      const next = await api.put<AgentDetail>(`/agents/${id}`, { baseRevision: base, definition: draft });
      qc.setQueryData(ak.detail(id), next);
      setDraft(next.definition);
      setBase(next.revision);
      setBaseDefinition(next.definition);
      setJsonDrafts({});
      setConflict(false);
      void message.success(t('agents.saved', { rev: next.revision }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'revision_conflict') {
        setConflict(true);
        void qc.invalidateQueries({ queryKey: ak.detail(id) });
      } else void message.error(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(a.definition);
    setBase(a.revision);
    setBaseDefinition(a.definition);
    setJsonDrafts({});
    setConflict(false);
  };

  const run = async () => {
    if (dirty || a.running) return;
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
          <Button icon={<Play20Regular />} onClick={() => setRunOpen(true)} disabled={a.running || dirty}>
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
                    setMergeRemote(a);
                    setChoices({});
                  }}
                  disabled={invalidJson || agent.isFetching}
                >
                  {t('agents.mergeReview')}
                </Button>
              )}
              {!(conflict || remoteChanged) && (
                <Button
                  size="small"
                  type="primary"
                  loading={saving}
                  disabled={invalidJson}
                  onClick={() => void save()}
                >
                  {t('common.save')}
                </Button>
              )}
            </Space>
          }
        />
      )}
      {invalidJson && <Alert banner type="error" message={t('agents.invalidJson')} />}

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
                jsonDrafts={jsonDrafts}
                onJsonDraft={(key, text) => setJsonDrafts((prev) => ({ ...prev, [key]: text }))}
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
                  setBaseDefinition(a.definition);
                  setJsonDrafts({});
                  setTab('definition');
                }}
              />
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(mergeRemote)}
        title={t('agents.mergeReview')}
        onCancel={() => setMergeRemote(null)}
        okText={t('agents.mergeApply')}
        okButtonProps={{ disabled: !merge || merge.conflicts.some((c) => !choices[JSON.stringify(c.path)]) }}
        onOk={() => {
          if (!merge || !mergeRemote) return;
          setDraft(merge.value);
          setBase(mergeRemote.revision);
          setBaseDefinition(mergeRemote.definition);
          setJsonDrafts({});
          setConflict(false);
          setMergeRemote(null);
        }}
      >
        <Typography.Paragraph>{t('agents.mergeHint')}</Typography.Paragraph>
        {merge?.conflicts.length === 0 && <Alert type="success" message={t('agents.mergeClean')} />}
        {merge?.conflicts.map((c) => (
          <div key={JSON.stringify(c.path)} style={{ marginBottom: 16 }}>
            <Typography.Text strong>{c.path.join('.')}</Typography.Text>
            <Radio.Group
              value={choices[JSON.stringify(c.path)]}
              onChange={(e) =>
                setChoices((prev) => ({
                  ...prev,
                  [JSON.stringify(c.path)]: e.target.value as 'local' | 'remote',
                }))
              }
            >
              {(['local', 'remote'] as const).map((side) => (
                <Radio key={side} value={side}>
                  {t(`agents.merge${side === 'local' ? 'Local' : 'Remote'}`)}
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      maxHeight: 180,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(c[side], null, 2) ?? t('agents.mergeDeleted')}
                  </pre>
                </Radio>
              ))}
            </Radio.Group>
          </div>
        ))}
      </Modal>
      <Modal
        open={runOpen}
        title={t('agents.runNow')}
        onCancel={() => setRunOpen(false)}
        onOk={() => void run()}
        okButtonProps={{ disabled: dirty || a.running }}
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
