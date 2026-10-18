import type { MemoryNote } from '@cangze/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, Flex, Input, Modal, Popconfirm, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { ak, useMemory } from '../../api/agents.ts';
import { errorText } from '../../lib/errors.ts';

export function MemoryPanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const memory = useMemory(agentId);
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ak.memory(agentId) });

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id)
        await api.put(`/agents/${agentId}/memory/${editing.id}`, {
          title: editing.title,
          content: editing.content,
        });
      else await api.post(`/agents/${agentId}/memory`, { title: editing.title, content: editing.content });
      setEditing(null);
      await refresh();
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">{t('agents.memoryHint')}</Typography.Text>
        <Space>
          <Button onClick={() => setEditing({ title: '', content: '' })}>{t('agents.addNote')}</Button>
          <Popconfirm
            title={t('agents.clearMemoryConfirm')}
            onConfirm={() => void api.del(`/agents/${agentId}/memory`).then(refresh)}
          >
            <Button danger disabled={!memory.data?.length}>
              {t('agents.clearMemory')}
            </Button>
          </Popconfirm>
        </Space>
      </Flex>
      {!memory.data?.length ? (
        <Empty description={t('agents.memoryEmpty')} />
      ) : (
        <Flex vertical gap={10}>
          {memory.data.map((n: MemoryNote) => (
            <Card
              key={n.id}
              size="small"
              title={n.title}
              extra={
                <Space>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setEditing({ id: n.id, title: n.title, content: n.content })}
                  >
                    {t('common.edit')}
                  </Button>
                  <Popconfirm
                    title={t('common.delete')}
                    onConfirm={() => void api.del(`/agents/${agentId}/memory/${n.id}`).then(refresh)}
                  >
                    <Button size="small" type="link" danger>
                      {t('common.delete')}
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                {n.content}
              </Typography.Paragraph>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {n.updatedBy} · {dayjs(n.updatedAt).format('YYYY-MM-DD HH:mm')}
              </Typography.Text>
            </Card>
          ))}
        </Flex>
      )}
      <Modal
        open={Boolean(editing)}
        title={editing?.id ? t('common.edit') : t('agents.addNote')}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
      >
        <Flex vertical gap={8}>
          <Input
            placeholder={t('agents.noteTitle')}
            value={editing?.title}
            onChange={(e) => setEditing((s) => (s ? { ...s, title: e.target.value } : s))}
          />
          <Input.TextArea
            autoSize={{ minRows: 5 }}
            value={editing?.content}
            onChange={(e) => setEditing((s) => (s ? { ...s, content: e.target.value } : s))}
          />
        </Flex>
      </Modal>
    </div>
  );
}
