import type { AgentDefinition } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, List, Row, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { ak } from '../../api/agents.ts';

interface Revision {
  revision: number;
  createdBy: string;
  note: string | null;
  createdAt: string;
  definition: AgentDefinition;
}

export function RevisionsPanel({
  agentId,
  current,
  onRestore,
}: {
  agentId: string;
  current: number;
  onRestore: (d: AgentDefinition) => void;
}) {
  const { t } = useTranslation();
  const revs = useQuery({
    queryKey: ak.revisions(agentId),
    queryFn: () => api.get<Revision[]>(`/agents/${agentId}/revisions`),
  });
  const [selected, setSelected] = useState<number | null>(null);
  const sel = revs.data?.find((r) => r.revision === (selected ?? current));
  return (
    <Row gutter={16}>
      <Col xs={24} md={9}>
        <List
          dataSource={revs.data ?? []}
          renderItem={(r) => (
            <List.Item onClick={() => setSelected(r.revision)} style={{ cursor: 'pointer' }}>
              <List.Item.Meta
                title={
                  <span>
                    {t('agents.revision')} {r.revision}{' '}
                    {r.revision === current && <Tag color="blue">{t('agents.current')}</Tag>}
                  </span>
                }
                description={`${r.createdBy} · ${dayjs(r.createdAt).format('YYYY-MM-DD HH:mm')}${r.note ? ` · ${r.note}` : ''}`}
              />
            </List.Item>
          )}
        />
      </Col>
      <Col xs={24} md={15}>
        {sel && (
          <Card
            size="small"
            title={`${t('agents.revision')} ${sel.revision}`}
            extra={
              sel.revision !== current && (
                <Button size="small" onClick={() => onRestore(sel.definition)}>
                  {t('agents.restore')}
                </Button>
              )
            }
          >
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              {t('agents.restoreHint')}
            </Typography.Paragraph>
            <pre
              className="cz-mono"
              style={{ whiteSpace: 'pre-wrap', maxHeight: 520, overflow: 'auto', margin: 0 }}
            >
              {JSON.stringify(sel.definition, null, 2)}
            </pre>
          </Card>
        )}
      </Col>
    </Row>
  );
}
