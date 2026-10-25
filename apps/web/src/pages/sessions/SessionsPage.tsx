import { ChatMultiple24Regular } from '@fluentui/react-icons';
import { Button, Empty, Flex, Grid, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ChatView } from './ChatView.tsx';
import { NewChatView } from './NewChatView.tsx';
import { SessionList } from './SessionList.tsx';

export function SessionsPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const screens = Grid.useBreakpoint();
  const isNew = pathname === '/sessions/new';

  const pane = isNew ? (
    <NewChatView />
  ) : id ? (
    <ChatView key={id} id={id} />
  ) : (
    <Flex align="center" justify="center" style={{ height: '100%' }}>
      <Empty
        image={<ChatMultiple24Regular style={{ fontSize: 48, color: token.colorTextTertiary }} />}
        description={t('chat.pickOrCreate')}
      >
        <Button type="primary" onClick={() => navigate('/sessions/new')}>
          {t('chat.newSession')}
        </Button>
      </Empty>
    </Flex>
  );

  if (!screens.md)
    return isNew ? <NewChatView /> : id ? <ChatView key={id} id={id} /> : <SessionList activeId={null} />;

  return (
    <Flex style={{ height: '100%' }}>
      <div
        style={{
          width: 280,
          flexShrink: 0,
          borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgLayout,
        }}
      >
        <SessionList activeId={id ?? null} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{pane}</div>
    </Flex>
  );
}
