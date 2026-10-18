import type { AgentDetail } from '@cangze/contracts';
import { Button, Card, Col, Descriptions, List, Row, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useRuns } from '../../api/agents.ts';
import { RunStatusTag } from './RunStatusTag.tsx';

export function OverviewPanel({ agent, onOpenRuns }: { agent: AgentDetail; onOpenRuns: () => void }) {
  const { t } = useTranslation();
  const runs = useRuns({ agentId: agent.id, limit: 5 });
  const d = agent.definition;
  return (
    <div style={{ maxWidth: 960 }}>
      {d.description && <Typography.Paragraph>{d.description}</Typography.Paragraph>}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('agents.stats.runs')} value={agent.stats.runs} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('agents.stats.succeeded')} value={agent.stats.succeeded} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('agents.stats.failed')} value={agent.stats.failed} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('agents.stats.costToday')} value={agent.costToday} precision={4} prefix="$" />
          </Card>
        </Col>
      </Row>
      <Descriptions column={{ xs: 1, md: 2 }} size="small" style={{ marginTop: 16 }} bordered>
        <Descriptions.Item label={t('agents.model')}>
          {d.modelRef ?? t('chat.defaultModel')}
        </Descriptions.Item>
        <Descriptions.Item label={t('agents.contextMode')}>
          {t(`agents.context.${d.contextMode}`)}
        </Descriptions.Item>
        <Descriptions.Item label={t('agents.tools')}>{d.tools.length}</Descriptions.Item>
        <Descriptions.Item label={t('agents.rules')}>{d.permissions.length}</Descriptions.Item>
        <Descriptions.Item label={t('agents.highRisk')}>
          {t(`agents.highRiskOptions.${d.highRisk}`)}
        </Descriptions.Item>
        <Descriptions.Item label={t('agents.nextFire')}>
          {agent.nextFireAt ? dayjs(agent.nextFireAt).format('YYYY-MM-DD HH:mm') : '—'}
        </Descriptions.Item>
      </Descriptions>
      <Card
        size="small"
        title={t('agents.recentRuns')}
        style={{ marginTop: 16 }}
        extra={
          <Button type="link" onClick={onOpenRuns}>
            {t('agents.allRuns')}
          </Button>
        }
      >
        <List
          dataSource={runs.data ?? []}
          locale={{ emptyText: t('agents.noRuns') }}
          renderItem={(r) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <span>
                    <RunStatusTag status={r.status} /> {dayjs(r.queuedAt).format('MM-DD HH:mm:ss')} ·{' '}
                    {t(`agents.triggerKinds.${r.triggerKind}`)}
                  </span>
                }
                description={
                  <Typography.Text type="secondary" ellipsis={{ tooltip: r.summary ?? r.error }}>
                    {r.summary ?? r.error ?? ''}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
