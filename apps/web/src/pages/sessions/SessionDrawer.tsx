import type { ModelInfo, SessionDetail } from '@cangze/contracts';
import {
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Space,
  Switch,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../../api/client.ts';
import { useModelDefaults } from '../../api/sessions.ts';
import { errorText } from '../../lib/errors.ts';
import { ModelPicker, ThinkingPicker, type ThinkingPickerValue } from './ModelPicker.tsx';

export function SessionDrawer({
  open,
  onClose,
  detail,
  model,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  detail: SessionDetail;
  model: ModelInfo | undefined;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const defaults = useModelDefaults();
  const [instructions, setInstructions] = useState(detail.instructions);
  const [compacting, setCompacting] = useState(false);
  useEffect(() => setInstructions(detail.instructions), [detail.instructions]);

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch(`/sessions/${detail.id}`, body);
      onChanged();
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const compact = async () => {
    setCompacting(true);
    try {
      const res = await api.post<{ compacted: boolean }>(`/sessions/${detail.id}/compact`);
      void message.info(res.compacted ? t('chat.compactDone') : t('chat.compactNothing'));
      onChanged();
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setCompacting(false);
    }
  };

  const remove = async () => {
    await api.del(`/sessions/${detail.id}`);
    onClose();
    navigate('/sessions');
  };

  const effectiveModelRef = detail.modelRef ?? defaults.data?.chat ?? null;
  const effectiveModel = model?.ref === effectiveModelRef ? model : model;
  const thinkingValue: ThinkingPickerValue = detail.thinkingLevel ?? '__default';
  const effectiveThinking =
    detail.thinkingLevel ?? defaults.data?.thinkingLevel ?? (effectiveModel?.reasoning ? 'medium' : 'off');

  return (
    <Drawer open={open} onClose={onClose} title={t('chat.sessionSettings')} width={420}>
      <Form layout="vertical">
        <Form.Item label={t('chat.model')}>
          <ModelPicker
            value={detail.modelRef}
            onChange={(v) => void patch({ modelRef: v })}
            style={{ width: '100%' }}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
            {t('chat.currentModel', {
              model: effectiveModel?.name ?? effectiveModelRef ?? t('chat.defaultModel'),
            })}
          </Typography.Text>
        </Form.Item>
        {effectiveModel?.reasoning && (
          <Form.Item label={t('settings.models.thinking')}>
            <ThinkingPicker
              model={effectiveModel}
              value={thinkingValue}
              onChange={(v) => void patch({ thinkingLevel: v === '__default' ? null : v })}
              style={{ width: '100%' }}
            />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              {t('chat.currentThinking', { level: t(`chat.levels.${effectiveThinking}`) })}
            </Typography.Text>
          </Form.Item>
        )}
        <Form.Item label={t('chat.instructions')} extra={t('chat.instructionsHint')}>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 14 }}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={() => instructions !== detail.instructions && void patch({ instructions })}
            placeholder={t('chat.instructionsPlaceholder')}
          />
        </Form.Item>
        <Form.Item label={t('chat.pinned')}>
          <Switch checked={detail.pinned} onChange={(v) => void patch({ pinned: v })} />
        </Form.Item>
      </Form>
      <Divider />
      <Descriptions column={1} size="small" title={t('chat.usage')}>
        <Descriptions.Item label={t('chat.contextUsed')}>
          {detail.contextTokens ?? 0} / {detail.contextWindow ?? model?.contextWindow ?? '?'}
        </Descriptions.Item>
        <Descriptions.Item label={t('chat.tokens')}>
          {detail.usage.input} ↑ · {detail.usage.output} ↓ · {detail.usage.cacheRead} {t('chat.cached')}
        </Descriptions.Item>
        <Descriptions.Item label={t('chat.cost')}>
          {detail.usage.costUnknown ? t('chat.costUnknown') : `$${detail.usage.cost.toFixed(4)}`}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('chat.compactHint')}
      </Typography.Paragraph>
      <Space wrap>
        <Button onClick={() => void compact()} loading={compacting} disabled={detail.running}>
          {t('chat.compact')}
        </Button>
        <Button href={`/api/v1/sessions/${detail.id}/export?format=markdown`}>{t('chat.exportMd')}</Button>
        <Button href={`/api/v1/sessions/${detail.id}/export?format=jsonl`}>{t('chat.exportJsonl')}</Button>
        <Button onClick={() => void patch({ archived: !detail.archived })}>
          {detail.archived ? t('chat.unarchive') : t('chat.archive')}
        </Button>
        <Popconfirm title={t('chat.deleteConfirm')} onConfirm={() => void remove()}>
          <Button danger>{t('common.delete')}</Button>
        </Popconfirm>
      </Space>
    </Drawer>
  );
}
