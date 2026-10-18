import { Add16Regular, Delete16Regular } from '@fluentui/react-icons';
import type { AgentDefinition, PermissionRule } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  TimePicker,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useAreas, useFloors, useLabels } from '../../api/ha.ts';
import { useEntities } from '../../api/queries.ts';

type Rule = PermissionRule;

const newRule = (): Rule => ({
  id: `rule-${Math.random().toString(36).slice(2, 8)}`,
  effect: 'allow',
  access: 'read',
  targets: { all: false, entities: [], domains: [], areas: [], floors: [], devices: [], labels: [] },
  services: [],
  constraints: { numeric: [], timeWindow: null, maxCallsPerHour: null },
});

export function PermissionsEditor({
  value,
  highRisk,
  onChange,
}: {
  value: Rule[];
  highRisk: AgentDefinition['highRisk'];
  onChange: (p: Partial<AgentDefinition>) => void;
}) {
  const { t } = useTranslation();
  const entities = useEntities();
  const areas = useAreas();
  const floors = useFloors();
  const labels = useLabels();
  const preview = useQuery({
    queryKey: ['agents', 'preview', JSON.stringify(value)],
    queryFn: () =>
      api.post<{ read: string[]; control: string[]; configure: boolean; denied: string[] }>(
        '/agents/permissions/preview',
        value,
      ),
    placeholderData: (prev) => prev,
  });

  const options = useMemo(() => {
    const ents = entities.data ?? [];
    return {
      entities: ents.map((e) => ({ value: e.entity_id, label: `${e.name} (${e.entity_id})` })),
      domains: [...new Set(ents.map((e) => e.domain))].sort().map((d) => ({ value: d, label: d })),
      areas: (areas.data ?? []).map((a) => ({ value: a.area_id, label: a.name })),
      floors: (floors.data ?? []).map((f) => ({ value: f.floor_id, label: f.name })),
      labels: (labels.data ?? []).map((l) => ({ value: l.label_id, label: l.name })),
    };
  }, [entities.data, areas.data, floors.data, labels.data]);

  const setRule = (i: number, patch: Partial<Rule>) =>
    onChange({ permissions: value.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setTargets = (i: number, patch: Partial<Rule['targets']>) =>
    setRule(i, { targets: { ...value[i]!.targets, ...patch } });
  const setConstraints = (i: number, patch: Partial<Rule['constraints']>) =>
    setRule(i, { constraints: { ...value[i]!.constraints, ...patch } });

  return (
    <Row gutter={20}>
      <Col xs={24} xl={15}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('agents.perm.hint')} />
        <Form layout="vertical">
          <Form.Item label={t('agents.highRisk')} extra={t('agents.highRiskHint')}>
            <Segmented
              value={highRisk}
              onChange={(v) => onChange({ highRisk: v as AgentDefinition['highRisk'] })}
              options={(['deny', 'approve', 'allow'] as const).map((k) => ({
                value: k,
                label: t(`agents.highRiskOptions.${k}`),
              }))}
            />
          </Form.Item>
        </Form>
        <Flex vertical gap={12}>
          {value.map((r, i) => (
            <Card
              key={r.id}
              size="small"
              title={
                <Space wrap>
                  <Segmented
                    size="small"
                    value={r.effect}
                    onChange={(v) => setRule(i, { effect: v as Rule['effect'] })}
                    options={[
                      { value: 'allow', label: t('agents.perm.allow') },
                      { value: 'deny', label: t('agents.perm.deny') },
                    ]}
                  />
                  <Segmented
                    size="small"
                    value={r.access}
                    onChange={(v) => setRule(i, { access: v as Rule['access'] })}
                    options={(['read', 'control', 'configure'] as const).map((k) => ({
                      value: k,
                      label: t(`agents.perm.access.${k}`),
                    }))}
                  />
                </Space>
              }
              extra={
                <Button
                  type="text"
                  danger
                  icon={<Delete16Regular />}
                  onClick={() => onChange({ permissions: value.filter((_, k) => k !== i) })}
                  aria-label={t('common.delete')}
                />
              }
            >
              <Form layout="vertical" size="small">
                <Form.Item>
                  <Checkbox
                    checked={r.targets.all}
                    onChange={(e) => setTargets(i, { all: e.target.checked })}
                  >
                    {t('agents.perm.all')}
                  </Checkbox>
                </Form.Item>
                {!r.targets.all && (
                  <Row gutter={8}>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('agents.perm.areas')}>
                        <Select
                          mode="multiple"
                          allowClear
                          options={options.areas}
                          value={r.targets.areas}
                          onChange={(v) => setTargets(i, { areas: v })}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('agents.perm.floors')}>
                        <Select
                          mode="multiple"
                          allowClear
                          options={options.floors}
                          value={r.targets.floors}
                          onChange={(v) => setTargets(i, { floors: v })}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('agents.perm.domains')}>
                        <Select
                          mode="tags"
                          allowClear
                          options={options.domains}
                          value={r.targets.domains}
                          onChange={(v) => setTargets(i, { domains: v })}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('agents.perm.labels')}>
                        <Select
                          mode="multiple"
                          allowClear
                          options={options.labels}
                          value={r.targets.labels}
                          onChange={(v) => setTargets(i, { labels: v })}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label={t('agents.perm.entities')} extra={t('agents.perm.entitiesHint')}>
                        <Select
                          mode="tags"
                          allowClear
                          options={options.entities}
                          value={r.targets.entities}
                          onChange={(v) => setTargets(i, { entities: v })}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {r.access !== 'read' && r.effect === 'allow' && (
                  <Form.Item label={t('agents.perm.services')} extra={t('agents.perm.servicesHint')}>
                    <Select
                      mode="tags"
                      value={r.services}
                      onChange={(v) => setRule(i, { services: v })}
                      placeholder="turn_on, turn_off, light.turn_on"
                    />
                  </Form.Item>
                )}
                {r.access !== 'read' && r.effect === 'allow' && (
                  <Collapse
                    size="small"
                    items={[
                      {
                        key: 'c',
                        label: t('agents.perm.constraints'),
                        children: (
                          <>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t('agents.perm.numeric')}
                            </Typography.Text>
                            {r.constraints.numeric.map((c, k) => (
                              <Space key={k} style={{ display: 'flex', margin: '6px 0' }} wrap>
                                <Input
                                  placeholder="brightness_pct"
                                  value={c.field}
                                  onChange={(e) =>
                                    setConstraints(i, {
                                      numeric: r.constraints.numeric.map((x, j) =>
                                        j === k ? { ...x, field: e.target.value } : x,
                                      ),
                                    })
                                  }
                                />
                                <InputNumber
                                  placeholder="min"
                                  value={c.min}
                                  onChange={(v) =>
                                    setConstraints(i, {
                                      numeric: r.constraints.numeric.map((x, j) =>
                                        j === k ? { ...x, min: v ?? undefined } : x,
                                      ),
                                    })
                                  }
                                />
                                <InputNumber
                                  placeholder="max"
                                  value={c.max}
                                  onChange={(v) =>
                                    setConstraints(i, {
                                      numeric: r.constraints.numeric.map((x, j) =>
                                        j === k ? { ...x, max: v ?? undefined } : x,
                                      ),
                                    })
                                  }
                                />
                                <Button
                                  type="text"
                                  icon={<Delete16Regular />}
                                  onClick={() =>
                                    setConstraints(i, {
                                      numeric: r.constraints.numeric.filter((_, j) => j !== k),
                                    })
                                  }
                                />
                              </Space>
                            ))}
                            <Button
                              size="small"
                              icon={<Add16Regular />}
                              onClick={() =>
                                setConstraints(i, { numeric: [...r.constraints.numeric, { field: '' }] })
                              }
                            >
                              {t('agents.perm.addNumeric')}
                            </Button>
                            <Form.Item label={t('agents.perm.timeWindow')} style={{ marginTop: 12 }}>
                              <Space wrap>
                                <TimePicker.RangePicker
                                  format="HH:mm"
                                  order={false}
                                  value={
                                    r.constraints.timeWindow
                                      ? [
                                          dayjs(r.constraints.timeWindow.start, 'HH:mm'),
                                          dayjs(r.constraints.timeWindow.end, 'HH:mm'),
                                        ]
                                      : null
                                  }
                                  onChange={(v) =>
                                    setConstraints(i, {
                                      timeWindow:
                                        v && v[0] && v[1]
                                          ? {
                                              start: v[0].format('HH:mm'),
                                              end: v[1].format('HH:mm'),
                                              days: r.constraints.timeWindow?.days ?? [],
                                            }
                                          : null,
                                    })
                                  }
                                />
                              </Space>
                            </Form.Item>
                            <Form.Item label={t('agents.perm.maxCalls')}>
                              <InputNumber
                                min={1}
                                value={r.constraints.maxCallsPerHour ?? undefined}
                                onChange={(v) => setConstraints(i, { maxCallsPerHour: v ?? null })}
                              />
                            </Form.Item>
                          </>
                        ),
                      },
                    ]}
                  />
                )}
                <Form.Item label={t('agents.perm.note')} style={{ marginTop: 12, marginBottom: 0 }}>
                  <Input value={r.note} onChange={(e) => setRule(i, { note: e.target.value })} />
                </Form.Item>
              </Form>
            </Card>
          ))}
          <Button icon={<Add16Regular />} onClick={() => onChange({ permissions: [...value, newRule()] })}>
            {t('agents.perm.add')}
          </Button>
        </Flex>
      </Col>
      <Col xs={24} xl={9}>
        <Card size="small" title={t('agents.perm.preview')} style={{ position: 'sticky', top: 0 }}>
          {preview.data && (
            <Flex vertical gap={12}>
              <PreviewGroup
                title={t('agents.perm.canControl', { n: preview.data.control.length })}
                ids={preview.data.control}
                color="blue"
              />
              <PreviewGroup
                title={t('agents.perm.canRead', {
                  n: preview.data.read.length - preview.data.control.length,
                })}
                ids={preview.data.read.filter((x) => !preview.data!.control.includes(x))}
              />
              {preview.data.denied.length > 0 && (
                <PreviewGroup
                  title={t('agents.perm.denied', { n: preview.data.denied.length })}
                  ids={preview.data.denied}
                  color="red"
                />
              )}
              <Typography.Text type="secondary">
                {preview.data.configure ? t('agents.perm.canConfigure') : t('agents.perm.noConfigure')}
              </Typography.Text>
            </Flex>
          )}
        </Card>
      </Col>
    </Row>
  );
}

function PreviewGroup({ title, ids, color }: { title: string; ids: string[]; color?: string }) {
  return (
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      <Flex wrap gap={4} style={{ marginTop: 6, maxHeight: 180, overflow: 'auto' }}>
        {ids.slice(0, 200).map((id) => (
          <Tag key={id} color={color} style={{ marginInlineEnd: 0 }}>
            {id}
          </Tag>
        ))}
      </Flex>
    </div>
  );
}
