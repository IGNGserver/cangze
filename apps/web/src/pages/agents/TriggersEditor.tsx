import { Add16Regular, Delete16Regular, Play16Regular } from '@fluentui/react-icons';
import type { AgentDefinition, AgentLimits, Trigger } from '@cangze/contracts';
import {
  App,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useEntities } from '../../api/queries.ts';
import { errorText } from '../../lib/errors.ts';
import { parseJsonObject } from '../../lib/json.ts';

interface TriggerStateView {
  triggerId: string;
  lastFiredAt: string | null;
  nextFireAt: string | null;
  fireCount: number;
  error: string | null;
}

const rid = () => `t-${Math.random().toString(36).slice(2, 7)}`;

const CRON_PRESETS = [
  { label: '07:00', value: '0 7 * * *' },
  { label: '21:00', value: '0 21 * * *' },
  { label: 'hourly', value: '0 * * * *' },
  { label: 'weekdays 08:00', value: '0 8 * * 1-5' },
];

function blank(kind: Trigger['kind']): Trigger {
  const base = { id: rid(), name: '', enabled: true, debounceSeconds: 0 };
  switch (kind) {
    case 'cron':
      return { ...base, kind, expression: '0 7 * * *' };
    case 'interval':
      return { ...base, kind, minutes: 30 };
    case 'ha_state':
      return { ...base, kind, entityIds: [], forSeconds: 0 };
    case 'ha_event':
      return { ...base, kind, eventType: '', dataMatch: {} };
    case 'ha_trigger':
      return { ...base, kind, trigger: { platform: 'sun', event: 'sunset' } };
    default:
      return { ...base, kind: 'manual' };
  }
}

export function TriggersEditor({
  agentId,
  value,
  states,
  limits,
  onChange,
  dirty,
  jsonDrafts,
  onJsonDraft,
}: {
  agentId: string;
  value: Trigger[];
  states: TriggerStateView[];
  limits: AgentLimits;
  onChange: (p: Partial<AgentDefinition>) => void;
  dirty: boolean;
  jsonDrafts: Record<string, string>;
  onJsonDraft: (key: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const entities = useEntities();
  const entityOptions = (entities.data ?? []).map((e) => ({
    value: e.entity_id,
    label: `${e.name} (${e.entity_id})`,
  }));
  const set = (i: number, patch: Partial<Trigger>) =>
    onChange({ triggers: value.map((x, k) => (k === i ? ({ ...x, ...patch } as Trigger) : x)) });

  const test = async (triggerId: string) => {
    if (dirty) return;
    try {
      await api.post(`/agents/${agentId}/triggers/${triggerId}/test`);
      void message.success(t('agents.trig.tested'));
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Form layout="inline">
          <Form.Item label={t('agents.trig.overlap')}>
            <Select
              style={{ width: 180 }}
              value={limits.overlap}
              onChange={(v) => onChange({ limits: { ...limits, overlap: v } })}
              options={(['skip', 'queue', 'replace'] as const).map((k) => ({
                value: k,
                label: t(`agents.trig.overlapOptions.${k}`),
              }))}
            />
          </Form.Item>
          <Form.Item label={t('agents.trig.misfire')}>
            <Select
              style={{ width: 180 }}
              value={limits.misfire}
              onChange={(v) => onChange({ limits: { ...limits, misfire: v } })}
              options={(['skip', 'run_once'] as const).map((k) => ({
                value: k,
                label: t(`agents.trig.misfireOptions.${k}`),
              }))}
            />
          </Form.Item>
        </Form>
      </Card>
      {value.length === 0 && <Empty description={t('agents.trig.none')} style={{ margin: '24px 0' }} />}
      <Flex vertical gap={12}>
        {value.map((tr, i) => {
          const st = states.find((s) => s.triggerId === tr.id);
          return (
            <Card
              key={tr.id}
              size="small"
              title={
                <Space wrap>
                  <Tag color="blue">{t(`agents.triggerKinds.${tr.kind}`)}</Tag>
                  <Input
                    size="small"
                    placeholder={t('agents.trig.name')}
                    value={tr.name}
                    onChange={(e) => set(i, { name: e.target.value })}
                    style={{ width: 200 }}
                  />
                </Space>
              }
              extra={
                <Space>
                  <Switch size="small" checked={tr.enabled} onChange={(v) => set(i, { enabled: v })} />
                  <Tooltip title={dirty ? t('agents.trig.saveFirst') : t('agents.trig.test')}>
                    <Button
                      type="text"
                      aria-label={t('agents.trig.test')}
                      icon={<Play16Regular />}
                      disabled={dirty}
                      onClick={() => void test(tr.id)}
                    />
                  </Tooltip>
                  <Button
                    type="text"
                    danger
                    icon={<Delete16Regular />}
                    onClick={() => onChange({ triggers: value.filter((_, k) => k !== i) })}
                  />
                </Space>
              }
            >
              <Form layout="vertical" size="small">
                {tr.kind === 'cron' && (
                  <Form.Item label={t('agents.trig.cron')} extra={t('agents.trig.cronHint')}>
                    <Space wrap>
                      <Input
                        className="cz-mono"
                        value={tr.expression}
                        onChange={(e) => set(i, { expression: e.target.value } as Partial<Trigger>)}
                        style={{ width: 220 }}
                      />
                      {CRON_PRESETS.map((p) => (
                        <Button
                          key={p.value}
                          size="small"
                          onClick={() => set(i, { expression: p.value } as Partial<Trigger>)}
                        >
                          {t(`agents.trig.presets.${p.label}`, { defaultValue: p.label })}
                        </Button>
                      ))}
                    </Space>
                  </Form.Item>
                )}
                {tr.kind === 'interval' && (
                  <Form.Item label={t('agents.trig.every')}>
                    <InputNumber
                      min={1}
                      max={10080}
                      value={tr.minutes}
                      onChange={(v) => set(i, { minutes: v ?? 30 } as Partial<Trigger>)}
                      addonAfter={t('agents.minutes')}
                    />
                  </Form.Item>
                )}
                {tr.kind === 'ha_state' && (
                  <Row gutter={8}>
                    <Col span={24}>
                      <Form.Item label={t('agents.trig.entities')} required>
                        <Select
                          mode="multiple"
                          options={entityOptions}
                          value={tr.entityIds}
                          onChange={(v) => set(i, { entityIds: v } as Partial<Trigger>)}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={6}>
                      <Form.Item label={t('agents.trig.from')}>
                        <Input
                          value={tr.from}
                          onChange={(e) => set(i, { from: e.target.value || undefined } as Partial<Trigger>)}
                          placeholder="off"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={6}>
                      <Form.Item label={t('agents.trig.to')}>
                        <Input
                          value={tr.to}
                          onChange={(e) => set(i, { to: e.target.value || undefined } as Partial<Trigger>)}
                          placeholder="on"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={6}>
                      <Form.Item label={t('agents.trig.attribute')}>
                        <Input
                          value={tr.attribute}
                          onChange={(e) =>
                            set(i, { attribute: e.target.value || undefined } as Partial<Trigger>)
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={6}>
                      <Form.Item label={t('agents.trig.for')}>
                        <InputNumber
                          min={0}
                          value={tr.forSeconds}
                          onChange={(v) => set(i, { forSeconds: v ?? 0 } as Partial<Trigger>)}
                          addonAfter="s"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {tr.kind === 'ha_event' && (
                  <Row gutter={8}>
                    <Col xs={24} md={10}>
                      <Form.Item label={t('agents.trig.eventType')} required>
                        <Input
                          value={tr.eventType}
                          onChange={(e) => set(i, { eventType: e.target.value } as Partial<Trigger>)}
                          placeholder="zha_event"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={14}>
                      <JsonField
                        label={t('agents.trig.dataMatch')}
                        value={tr.dataMatch}
                        text={jsonDrafts[tr.id]}
                        onText={(text) => onJsonDraft(tr.id, text)}
                        onChange={(v) => set(i, { dataMatch: v } as Partial<Trigger>)}
                      />
                    </Col>
                  </Row>
                )}
                {tr.kind === 'ha_trigger' && (
                  <JsonField
                    label={t('agents.trig.haTrigger')}
                    extra={t('agents.trig.haTriggerHint')}
                    value={tr.trigger}
                    text={jsonDrafts[tr.id]}
                    onText={(text) => onJsonDraft(tr.id, text)}
                    onChange={(v) => set(i, { trigger: v } as Partial<Trigger>)}
                  />
                )}
                {tr.kind !== 'manual' && tr.kind !== 'cron' && tr.kind !== 'interval' && (
                  <Form.Item label={t('agents.trig.debounce')}>
                    <InputNumber
                      min={0}
                      value={tr.debounceSeconds}
                      onChange={(v) => set(i, { debounceSeconds: v ?? 0 })}
                      addonAfter="s"
                    />
                  </Form.Item>
                )}
              </Form>
              {st && (
                <Space wrap size={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('agents.trig.fired', { n: st.fireCount })}
                    {st.lastFiredAt
                      ? ` · ${t('agents.trig.last', { when: dayjs(st.lastFiredAt).format('MM-DD HH:mm') })}`
                      : ''}
                    {st.nextFireAt
                      ? ` · ${t('agents.trig.nextAt', { when: dayjs(st.nextFireAt).format('MM-DD HH:mm') })}`
                      : ''}
                  </Typography.Text>
                  {st.error && <Tag color="red">{st.error}</Tag>}
                </Space>
              )}
            </Card>
          );
        })}
      </Flex>
      <Dropdown
        menu={{
          items: (['cron', 'interval', 'ha_state', 'ha_event', 'ha_trigger', 'manual'] as const).map((k) => ({
            key: k,
            label: t(`agents.triggerKinds.${k}`),
          })),
          onClick: ({ key }) => onChange({ triggers: [...value, blank(key as Trigger['kind'])] }),
        }}
      >
        <Button icon={<Add16Regular />} style={{ marginTop: 12 }}>
          {t('agents.trig.add')}
        </Button>
      </Dropdown>
    </div>
  );
}

function JsonField({
  label,
  extra,
  value,
  onChange,
  text,
  onText,
}: {
  label: string;
  extra?: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  text?: string;
  onText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const raw = text ?? JSON.stringify(value, null, 2);
  const invalid = !parseJsonObject(raw).ok;
  return (
    <Form.Item
      label={label}
      extra={extra}
      validateStatus={invalid ? 'error' : undefined}
      help={invalid ? t('agents.invalidJson') : undefined}
    >
      <Input.TextArea
        aria-label={label}
        className="cz-mono"
        autoSize={{ minRows: 2, maxRows: 10 }}
        value={raw}
        onChange={(e) => {
          onText(e.target.value);
          const parsed = parseJsonObject(e.target.value);
          if (parsed.ok) onChange(parsed.value);
        }}
      />
    </Form.Item>
  );
}
