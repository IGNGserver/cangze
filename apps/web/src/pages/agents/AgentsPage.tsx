import { Add20Regular, Bot24Regular } from '@fluentui/react-icons';
import type { AgentSummary } from '@cangze/contracts';
import { Badge, Button, Empty, Flex, Grid, List, Skeleton, Switch, Tag, theme, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useAgents } from '../../api/agents.ts';
import { AgentDetailView } from './AgentDetailView.tsx';
import { NewAgentModal } from './NewAgentModal.tsx';
import { RunStatusTag } from './RunStatusTag.tsx';

export function AgentsPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { id } = useParams();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const agents = useAgents();
  const [creating, setCreating] = useState(false);

  const list = (
    <Flex vertical style={{ height: '100%' }}>
      <Flex
        align="center"
        justify="space-between"
        style={{ padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          {t('nav.agents')}
        </Typography.Title>
        <Button type="primary" icon={<Add20Regular />} onClick={() => setCreating(true)}>
          {t('agents.new')}
        </Button>
      </Flex>
      <div className="cz-scroll" style={{ flex: 1, minHeight: 0 }}>
        {agents.isLoading ? (
          <Skeleton active style={{ padding: 16 }} />
        ) : !agents.data?.length ? (
          <Empty style={{ marginTop: 48 }} description={t('agents.empty')} />
        ) : (
          <List
            dataSource={agents.data}
            renderItem={(a: AgentSummary) => (
              <List.Item
                onClick={() => navigate(`/agents/${a.id}`)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  background: a.id === id ? token.colorFillSecondary : undefined,
                }}
                extra={
                  <Switch
                    size="small"
                    checked={a.enabled}
                    onClick={(on, e) => {
                      e.stopPropagation();
                      void api.post(`/agents/${a.id}/enabled`, { enabled: on });
                    }}
                  />
                }
              >
                <List.Item.Meta
                  avatar={
                    a.running ? (
                      <Badge status="processing" />
                    ) : (
                      <Bot24Regular style={{ color: token.colorTextTertiary }} />
                    )
                  }
                  title={a.name}
                  description={
                    <Flex vertical gap={4}>
                      <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                        {a.description || t('agents.noDescription')}
                      </Typography.Text>
                      <Flex gap={6} wrap>
                        {a.lastRun && <RunStatusTag status={a.lastRun.status} />}
                        {a.nextFireAt && (
                          <Tag>{t('agents.next', { when: dayjs(a.nextFireAt).format('MM-DD HH:mm') })}</Tag>
                        )}
                      </Flex>
                    </Flex>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
      <NewAgentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(newId) => navigate(`/agents/${newId}`)}
      />
    </Flex>
  );

  const detail = id ? (
    <AgentDetailView key={id} id={id} />
  ) : (
    <Flex align="center" justify="center" style={{ height: '100%' }}>
      <Empty description={t('agents.pick')} />
    </Flex>
  );

  if (!screens.lg) return id ? detail : list;
  return (
    <Flex style={{ height: '100%' }}>
      <div style={{ width: 320, flexShrink: 0, borderInlineEnd: `1px solid ${token.colorBorderSecondary}` }}>
        {list}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{detail}</div>
    </Flex>
  );
}
