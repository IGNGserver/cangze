import type { AgentDetail } from '@cangze/contracts';
import { App, Card, Flex, Modal, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { errorText } from '../../lib/errors.ts';
import { TEMPLATES } from './templates.ts';

export function NewAgentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const create = async (key: string) => {
    const tpl = TEMPLATES.find((x) => x.key === key)!;
    setBusy(key);
    try {
      const res = await api.post<AgentDetail>('/agents', { definition: tpl.definition(t) });
      onClose();
      onCreated(res.id);
    } catch (e) {
      void message.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('agents.new')} width={640}>
      <Typography.Paragraph type="secondary">{t('agents.newHint')}</Typography.Paragraph>
      <Flex vertical gap={10}>
        {TEMPLATES.map((tpl) => (
          <Card
            key={tpl.key}
            hoverable
            size="small"
            onClick={() => !busy && void create(tpl.key)}
            loading={busy === tpl.key}
          >
            <Typography.Text strong>{t(`agents.templates.${tpl.key}.name`)}</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {t(`agents.templates.${tpl.key}.description`)}
            </Typography.Paragraph>
          </Card>
        ))}
      </Flex>
    </Modal>
  );
}
