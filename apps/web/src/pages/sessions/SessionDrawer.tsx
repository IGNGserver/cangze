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
import { errorText } from '../../lib/errors.ts';
import { ModelPicker } from './ModelPicker.tsx';

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

  return (
    <Drawer open={open} onClose={onClose} title={t('chat.sessionSettings')} width={420}>
      <Form layout="vertical">
        <Form.Item label={t('chat.model')}>
          <ModelPicker
            value={detail.modelRef}
            onChange={(v) => void patch({ modelRef: v })}
            style={{ width: '100%' }}
          />
        </Form.Item>
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
