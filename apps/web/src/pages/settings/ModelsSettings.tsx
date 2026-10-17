import type { CustomModel, ModelDefaults, Provider, ThinkingLevel } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { sk, useModelDefaults } from '../../api/sessions.ts';
import { errorText } from '../../lib/errors.ts';
import { ModelPicker } from '../sessions/ModelPicker.tsx';
import { Section } from './Section.tsx';

interface CatalogItem {
  id: string;
  name: string;
  modelCount: number;
  configured: boolean;
}

const PRESETS: Array<{
  name: string;
  api: 'openai-completions' | 'anthropic-messages';
  baseUrl: string;
  keyless?: boolean;
}> = [
  { name: 'Ollama', api: 'openai-completions', baseUrl: 'http://192.168.1.10:11434/v1', keyless: true },
  { name: 'LM Studio', api: 'openai-completions', baseUrl: 'http://192.168.1.10:1234/v1', keyless: true },
  { name: 'vLLM', api: 'openai-completions', baseUrl: 'http://192.168.1.10:8000/v1', keyless: true },
];

export function ModelsSettings() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: sk.providers, queryFn: () => api.get<Provider[]>('/providers') });
  const defaults = useModelDefaults();
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: sk.providers }),
      qc.invalidateQueries({ queryKey: sk.models }),
      qc.invalidateQueries({ queryKey: sk.defaults }),
    ]);

  const setDefaults = async (patch: Partial<ModelDefaults>) => {
    try {
      await api.put('/models/defaults', { ...defaults.data, ...patch });
      await refresh();
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const test = async (p: Provider) => {
    setTesting(p.id);
    try {
      const r = await api.post<{
        ok: boolean;
        error: string | null;
        model: string | null;
        latencyMs: number | null;
      }>(`/providers/${p.id}/test`, {});
      if (r.ok) void message.success(t('settings.models.testOk', { model: r.model, ms: r.latencyMs }));
      else void message.error(r.error ?? t('settings.models.testFailed'));
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setTesting(null);
    }
  };

  return (
    <>
      <Section title={t('settings.models.defaults')} description={t('settings.models.defaultsHint')}>
        {defaults.data && (
          <Form layout="vertical">
            <Form.Item label={t('settings.models.chatModel')}>
              <ModelPicker
                allowDefault={false}
                value={defaults.data.chat}
                onChange={(v) => void setDefaults({ chat: v })}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={t('settings.models.utilityModel')} extra={t('settings.models.utilityHint')}>
              <ModelPicker
                value={defaults.data.utility}
                onChange={(v) => void setDefaults({ utility: v })}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={t('settings.models.thinking')}>
              <Select<ThinkingLevel>
                value={defaults.data.thinkingLevel}
                onChange={(v) => void setDefaults({ thinkingLevel: v })}
                style={{ width: 200 }}
                options={(['off', 'minimal', 'low', 'medium', 'high'] as const).map((l) => ({
                  value: l,
                  label: t(`chat.levels.${l}`),
                }))}
              />
            </Form.Item>
          </Form>
        )}
      </Section>
      <Section
        title={t('settings.models.providers')}
        description={t('settings.models.providersHint')}
        extra={
          <Button type="primary" onClick={() => setAdding(true)}>
            {t('settings.models.add')}
          </Button>
        }
      >
        <List
          dataSource={providers.data ?? []}
          locale={{ emptyText: t('settings.models.empty') }}
          renderItem={(p) => (
            <List.Item
              actions={[
                <Button key="t" size="small" loading={testing === p.id} onClick={() => void test(p)}>
                  {t('settings.models.test')}
                </Button>,
                <ProviderEditButton key="e" provider={p} onSaved={refresh} />,
                <Popconfirm
                  key="d"
                  title={t('settings.models.removeConfirm')}
                  onConfirm={() => void api.del(`/providers/${p.id}`).then(refresh)}
                >
                  <Button size="small" danger>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {p.name}
                    <Tag>{p.kind === 'builtin' ? t('settings.models.builtin') : p.api}</Tag>
                    {!p.enabled && <Tag color="default">{t('settings.models.disabled')}</Tag>}
                  </Space>
                }
                description={[
                  p.baseUrl,
                  p.hasKey ? t('settings.models.keyStored', { hint: p.keyHint }) : t('settings.models.noKey'),
                  p.kind === 'custom' ? t('settings.models.modelCount', { n: p.models.length }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </List.Item>
          )}
        />
      </Section>
      <AddProviderModal open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </>
  );
}

function ProviderEditButton({ provider, onSaved }: { provider: Provider; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const save = async () => {
    const v = await form.validateFields();
    try {
      await api.patch(`/providers/${provider.id}`, {
        ...(v.apiKey ? { apiKey: v.apiKey } : {}),
        enabled: v.enabled,
        ...(provider.kind === 'custom' ? { name: v.name, baseUrl: v.baseUrl, models: v.models } : {}),
      });
      await onSaved();
      setOpen(false);
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        {t('common.edit')}
      </Button>
      <Modal
        open={open}
        title={provider.name}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        width={640}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: provider.name,
            baseUrl: provider.baseUrl,
            enabled: provider.enabled,
            models: provider.models,
          }}
        >
          {provider.kind === 'custom' && (
            <>
              <Form.Item name="name" label={t('settings.models.name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="baseUrl"
                label={t('settings.models.baseUrl')}
                rules={[{ required: true, type: 'url' }]}
              >
                <Input />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="apiKey"
            label={t('settings.models.apiKey')}
            extra={provider.hasKey ? t('settings.models.keyKeep') : undefined}
          >
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name="enabled" label={t('settings.models.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          {provider.kind === 'custom' && <ModelsEditor />}
        </Form>
      </Modal>
    </>
  );
}

function ModelsEditor() {
  const { t } = useTranslation();
  return (
    <Form.List name="models">
      {(fields, { add, remove }) => (
        <div>
          <Typography.Text strong>{t('settings.models.models')}</Typography.Text>
          {fields.map((f) => (
            <Flex key={f.key} gap={8} wrap align="baseline" style={{ marginTop: 8 }}>
              <Form.Item
                name={[f.name, 'id']}
                rules={[{ required: true }]}
                style={{ flex: 2, minWidth: 160, marginBottom: 0 }}
              >
                <Input placeholder={t('settings.models.modelId')} />
              </Form.Item>
              <Form.Item
                name={[f.name, 'contextWindow']}
                initialValue={128000}
                style={{ width: 120, marginBottom: 0 }}
              >
                <InputNumber min={1024} step={1024} placeholder="context" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name={[f.name, 'maxTokens']}
                initialValue={8192}
                style={{ width: 100, marginBottom: 0 }}
              >
                <InputNumber min={256} step={256} placeholder="max out" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name={[f.name, 'reasoning']}
                valuePropName="checked"
                initialValue={false}
                style={{ marginBottom: 0 }}
              >
                <Checkbox>{t('chat.reasoning')}</Checkbox>
              </Form.Item>
              <Form.Item
                name={[f.name, 'vision']}
                valuePropName="checked"
                initialValue={false}
                style={{ marginBottom: 0 }}
              >
                <Checkbox>{t('chat.vision')}</Checkbox>
              </Form.Item>
              <Button type="text" danger onClick={() => remove(f.name)}>
                ✕
              </Button>
            </Flex>
          ))}
          <Button
            type="dashed"
            block
            style={{ marginTop: 8 }}
            onClick={() =>
              add({ id: '', contextWindow: 128000, maxTokens: 8192, reasoning: false, vision: false })
            }
          >
            {t('settings.models.addModel')}
          </Button>
        </div>
      )}
    </Form.List>
  );
}

function AddProviderModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const catalog = useQuery({
    queryKey: sk.catalog,
    queryFn: () => api.get<CatalogItem[]>('/providers/catalog'),
    enabled: open,
  });
  const [kind, setKind] = useState<'builtin' | 'custom'>('builtin');
  const [form] = Form.useForm();
  const [discovering, setDiscovering] = useState(false);

  const discover = async () => {
    const { baseUrl, apiKey } = form.getFieldsValue();
    if (!baseUrl) return;
    setDiscovering(true);
    try {
      const res = await api.post<{ models: string[] }>('/providers/discover', {
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
      });
      const current: CustomModel[] = form.getFieldValue('models') ?? [];
      const known = new Set(current.map((m) => m.id));
      form.setFieldValue('models', [
        ...current.filter((m) => m.id),
        ...res.models
          .filter((id) => !known.has(id))
          .map((id) => ({ id, contextWindow: 128000, maxTokens: 8192, reasoning: false, vision: false })),
      ]);
      void message.success(t('settings.models.discovered', { n: res.models.length }));
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setDiscovering(false);
    }
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post(
        '/providers',
        kind === 'builtin'
          ? { kind, builtinId: v.builtinId, apiKey: v.apiKey }
          : {
              kind,
              name: v.name,
              api: v.api,
              baseUrl: v.baseUrl,
              ...(v.apiKey ? { apiKey: v.apiKey } : {}),
              models: (v.models ?? []).filter((m: CustomModel) => m.id),
            },
      );
      await onAdded();
      form.resetFields();
      onClose();
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  return (
    <Modal
      open={open}
      title={t('settings.models.add')}
      onCancel={onClose}
      onOk={() => void submit()}
      width={680}
      destroyOnHidden
    >
      <Radio.Group
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        style={{ marginBottom: 16 }}
      >
        <Radio.Button value="builtin">{t('settings.models.builtinTab')}</Radio.Button>
        <Radio.Button value="custom">{t('settings.models.customTab')}</Radio.Button>
      </Radio.Group>
      <Form form={form} layout="vertical" initialValues={{ api: 'openai-completions', models: [] }}>
        {kind === 'builtin' ? (
          <>
            <Form.Item name="builtinId" label={t('settings.models.service')} rules={[{ required: true }]}>
              <Select
                showSearch
                loading={catalog.isLoading}
                optionFilterProp="label"
                options={(catalog.data ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.modelCount})`,
                  disabled: c.configured,
                }))}
              />
            </Form.Item>
            <Form.Item name="apiKey" label={t('settings.models.apiKey')} rules={[{ required: true }]}>
              <Input.Password autoComplete="off" />
            </Form.Item>
          </>
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t('settings.models.customHint')}
            />
            <Flex gap={8} wrap style={{ marginBottom: 12 }}>
              {PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="small"
                  onClick={() => form.setFieldsValue({ name: p.name, api: p.api, baseUrl: p.baseUrl })}
                >
                  {p.name}
                </Button>
              ))}
            </Flex>
            <Form.Item name="name" label={t('settings.models.name')} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="api" label={t('settings.models.api')}>
              <Select
                options={[
                  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
                  { value: 'openai-responses', label: 'OpenAI Responses' },
                  { value: 'anthropic-messages', label: 'Anthropic Messages' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label={t('settings.models.baseUrl')}
              rules={[{ required: true, type: 'url' }]}
            >
              <Input placeholder="https://api.example.com/v1" />
            </Form.Item>
            <Form.Item
              name="apiKey"
              label={t('settings.models.apiKey')}
              extra={t('settings.models.apiKeyOptional')}
            >
              <Input.Password autoComplete="off" />
            </Form.Item>
            <Button onClick={() => void discover()} loading={discovering} style={{ marginBottom: 12 }}>
              {t('settings.models.discover')}
            </Button>
            <ModelsEditor />
          </>
        )}
      </Form>
    </Modal>
  );
}
