import type { AgentDefinition } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { sk } from '../../api/sessions.ts';
import { ModelPicker } from '../sessions/ModelPicker.tsx';

interface ToolInfo {
  name: string;
  label: string;
  description: string;
  risk: 'read' | 'control' | 'configure' | 'system';
  group: string;
}

const RISK_COLOR = { read: 'default', control: 'blue', configure: 'orange', system: 'purple' } as const;

export function DefinitionForm({
  value,
  onChange,
}: {
  value: AgentDefinition;
  onChange: (p: Partial<AgentDefinition>) => void;
}) {
  const { t } = useTranslation();
  const tools = useQuery({ queryKey: sk.tools, queryFn: () => api.get<ToolInfo[]>('/tools') });
  const grantable = (tools.data ?? []).filter((x) => x.group !== 'agents');
  const memory = ['memory_list', 'memory_write', 'memory_delete'];

  return (
    <Form layout="vertical" style={{ maxWidth: 860 }}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label={t('agents.name')} required>
            <Input value={value.name} maxLength={80} onChange={(e) => onChange({ name: e.target.value })} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label={t('agents.model')}>
            <ModelPicker
              value={value.modelRef}
              onChange={(v) => onChange({ modelRef: v })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label={t('agents.description')}>
        <Input
          value={value.description}
          maxLength={1000}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Form.Item>
      <Form.Item label={t('agents.instructions')} extra={t('agents.instructionsHint')} required>
        <Input.TextArea
          autoSize={{ minRows: 6, maxRows: 24 }}
          value={value.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
        />
      </Form.Item>
      <Form.Item label={t('agents.tools')} extra={t('agents.toolsHint')}>
        <Checkbox.Group
          value={value.tools}
          onChange={(v) => onChange({ tools: v as string[] })}
          style={{ width: '100%' }}
        >
          <Row gutter={[8, 8]}>
            {grantable.map((tool) => (
              <Col xs={24} md={12} key={tool.name}>
                <Checkbox value={tool.name}>
                  <Space size={4}>
                    {t(`tools.${tool.name}`, { defaultValue: tool.label })}
                    <Tag color={RISK_COLOR[tool.risk]} style={{ marginInlineEnd: 0 }}>
                      {t(`agents.risk.${tool.risk}`)}
                    </Tag>
                  </Space>
                </Checkbox>
              </Col>
            ))}
            {memory.map((m) => (
              <Col xs={24} md={12} key={m}>
                <Checkbox value={m}>{t(`agents.memoryTools.${m}`)}</Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
      </Form.Item>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item label={t('agents.contextMode')} extra={t('agents.contextHint')}>
            <Select
              value={value.contextMode}
              onChange={(v) => onChange({ contextMode: v })}
              options={[
                { value: 'isolated', label: t('agents.context.isolated') },
                { value: 'continuous', label: t('agents.context.continuous') },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={t('agents.priority')} extra={t('agents.priorityHint')}>
            <Slider min={1} max={100} value={value.priority} onChange={(v) => onChange({ priority: v })} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={t('agents.respectManual')} extra={t('agents.respectManualHint')}>
            <InputNumber
              min={0}
              max={1440}
              value={value.respectManualMinutes}
              onChange={(v) => onChange({ respectManualMinutes: v ?? 0 })}
              addonAfter={t('agents.minutes')}
            />
          </Form.Item>
        </Col>
      </Row>
      <Typography.Title level={5}>{t('agents.limits')}</Typography.Title>
      <Form.Item label={t('agents.indirectActions')} extra={t('agents.indirectActionsHint')}>
        <Switch
          checked={value.allowIndirectActions}
          onChange={(v) => onChange({ allowIndirectActions: v })}
        />
      </Form.Item>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Form.Item label={t('agents.maxRunSeconds')}>
            <InputNumber
              min={10}
              max={3600}
              value={value.limits.maxRunSeconds}
              onChange={(v) => onChange({ limits: { ...value.limits, maxRunSeconds: v ?? 300 } })}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label={t('agents.maxToolCalls')}>
            <InputNumber
              min={1}
              max={500}
              value={value.limits.maxToolCalls}
              onChange={(v) => onChange({ limits: { ...value.limits, maxToolCalls: v ?? 40 } })}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label={t('agents.dailyCost')}>
            <Space>
              <Switch
                size="small"
                checked={value.limits.dailyCostLimit !== null}
                onChange={(on) => onChange({ limits: { ...value.limits, dailyCostLimit: on ? 1 : null } })}
              />
              {value.limits.dailyCostLimit !== null && (
                <InputNumber
                  min={0}
                  step={0.5}
                  prefix="$"
                  value={value.limits.dailyCostLimit}
                  onChange={(v) => onChange({ limits: { ...value.limits, dailyCostLimit: v ?? 0 } })}
                />
              )}
            </Space>
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label={t('agents.notifyOnFailure')}>
            <Switch checked={value.notifyOnFailure} onChange={(v) => onChange({ notifyOnFailure: v })} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
