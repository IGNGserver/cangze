import { ChatMultiple24Regular } from '@fluentui/react-icons';
import type { SessionSummary } from '@cangze/contracts';
import { App, Button, Empty, Flex, Grid, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { errorText } from '../../lib/errors.ts';
import { ChatView } from './ChatView.tsx';
import { SessionList } from './SessionList.tsx';

export function SessionsPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { id } = useParams();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();

  const create = async () => {
    try {
      const s = await api.post<SessionSummary>('/sessions', {});
      navigate(`/sessions/${s.id}`);
    } catch (e) {
      void message.error(errorText(t, e));
    }
  };

  const chat = id ? (
    <ChatView key={id} id={id} />
  ) : (
    <Flex align="center" justify="center" style={{ height: '100%' }}>
      <Empty
        image={<ChatMultiple24Regular style={{ fontSize: 48, color: token.colorTextTertiary }} />}
        description={t('chat.pickOrCreate')}
      >
        <Button type="primary" onClick={() => void create()}>
          {t('chat.newSession')}
        </Button>
      </Empty>
    </Flex>
  );

  if (!screens.md) return id ? chat : <SessionList activeId={null} />;

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
      <div style={{ flex: 1, minWidth: 0 }}>{chat}</div>
    </Flex>
  );
}
