import type { ModelInfo, ThinkingLevel } from '@cangze/contracts';
import { Select, Space, Tag } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModels } from '../../api/sessions.ts';

/** Keep this list in sync with the contract so default model settings never hide valid levels. */
export const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export type ThinkingPickerValue = ThinkingLevel | '__default';

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
  style?: CSSProperties;
  size?: 'small' | 'middle';
}) {
  const { t } = useTranslation();
  const models = useModels();
  const options = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of models.data ?? []) groups.set(m.providerName, [...(groups.get(m.providerName) ?? []), m]);
    const out: Array<{
      label: string;
      options: Array<{ value: string; label: ReactNode; search: string }>;
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

/**
 * Select a per-session thinking override. `__default` means the configured model default and is
 * deliberately distinct from `off`, which is an explicit request to disable reasoning.
 */
export function ThinkingPicker({
  model,
  value,
  onChange,
  allowDefault = true,
  style,
  size,
}: {
  model: ModelInfo | undefined;
  value: ThinkingPickerValue;
  onChange: (level: ThinkingPickerValue) => void;
  allowDefault?: boolean;
  style?: CSSProperties;
  size?: 'small' | 'middle';
}) {
  const { t } = useTranslation();
  const options = useMemo(() => {
    if (!model?.reasoning) return [];
    const available = model.thinkingLevels.length ? model.thinkingLevels : THINKING_LEVELS;
    const levels = [...new Set(available)];
    return [
      ...(allowDefault ? [{ value: '__default' as const, label: t('chat.thinkingDefault') }] : []),
      ...levels.map((level) => ({ value: level, label: t(`chat.levels.${level}`) })),
    ];
  }, [allowDefault, model, t]);

  if (!model?.reasoning) return null;
  return (
    <Select<ThinkingPickerValue>
      size={size}
      value={value}
      onChange={onChange}
      options={options}
      style={{ width: 144, ...style }}
      aria-label={t('settings.models.thinking')}
    />
  );
}
