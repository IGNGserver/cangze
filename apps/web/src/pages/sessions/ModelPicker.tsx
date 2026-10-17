import type { ModelInfo } from '@cangze/contracts';
import { Select, Space, Tag } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModels } from '../../api/sessions.ts';

export function ModelPicker({
  value,
  onChange,
  allowDefault = true,
  style,
  size,
}: {
  value: string | null;
  onChange: (ref: string | null) => void;
  allowDefault?: boolean;
  style?: React.CSSProperties;
  size?: 'small' | 'middle';
}) {
  const { t } = useTranslation();
  const models = useModels();
  const options = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of models.data ?? []) groups.set(m.providerName, [...(groups.get(m.providerName) ?? []), m]);
    const out: Array<{
      label: string;
      options: Array<{ value: string; label: React.ReactNode; search: string }>;
    }> = [];
    if (allowDefault)
      out.push({
        label: t('chat.default'),
        options: [{ value: '__default', label: t('chat.defaultModel'), search: 'default' }],
      });
    for (const [provider, list] of groups) {
      out.push({
        label: provider,
        options: list.map((m) => ({
          value: m.ref,
          search: `${m.name} ${m.id} ${provider}`.toLowerCase(),
          label: (
            <Space size={4}>
              <span>{m.name}</span>
              {m.reasoning && <Tag style={{ marginInlineEnd: 0 }}>{t('chat.reasoning')}</Tag>}
              {m.vision && <Tag style={{ marginInlineEnd: 0 }}>{t('chat.vision')}</Tag>}
            </Space>
          ),
        })),
      });
    }
    return out;
  }, [models.data, allowDefault, t]);

  return (
    <Select
      size={size}
      showSearch
      value={value ?? (allowDefault ? '__default' : undefined)}
      onChange={(v: string) => onChange(v === '__default' ? null : v)}
      options={options}
      loading={models.isLoading}
      filterOption={(input, opt) =>
        String((opt as { search?: string }).search ?? '').includes(input.toLowerCase())
      }
      popupMatchSelectWidth={false}
      style={{ minWidth: 200, ...style }}
      placeholder={t('chat.chooseModel')}
      notFoundContent={t('chat.noModels')}
    />
  );
}
