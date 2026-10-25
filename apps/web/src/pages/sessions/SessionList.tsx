import { Conversations, type ConversationItemType } from '@ant-design/x';
import {
  Archive16Regular,
  Delete16Regular,
  Pin16Regular,
  PinOff16Regular,
  Search20Regular,
} from '@fluentui/react-icons';
import type { SessionSummary } from '@cangze/contracts';
import { App, Badge, Flex, Input, Segmented, theme } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../../api/client.ts';
import { useSessionList } from '../../api/sessions.ts';
import { errorText } from '../../lib/errors.ts';

export function SessionList({ activeId }: { activeId: string | null }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const list = useSessionList(archived);

  const group = (s: SessionSummary) => {
    if (s.pinned) return t('chat.groups.pinned');
    const d = dayjs(s.lastMessageAt ?? s.createdAt);
    if (d.isAfter(dayjs().startOf('day'))) return t('chat.groups.today');
    if (d.isAfter(dayjs().subtract(1, 'day').startOf('day'))) return t('chat.groups.yesterday');
    if (d.isAfter(dayjs().subtract(7, 'day'))) return t('chat.groups.week');
    return t('chat.groups.earlier');
  };

  const items: ConversationItemType[] = useMemo(
    () =>
      (list.data ?? [])
        .filter((s) => !q || (s.title || t('chat.untitled')).toLowerCase().includes(q.toLowerCase()))
        .map((s) => ({
          key: s.id,
          label: (
            <Flex align="center" gap={6}>
              {s.running && <Badge status="processing" />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title || t('chat.untitled')}
              </span>
            </Flex>
          ),
          group: group(s),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, t],
  );

  const patch = (id: string, body: Record<string, unknown>) =>
    api.patch(`/sessions/${id}`, body).catch((e) => message.error(errorText(t, e)));

  return (
    <Flex vertical style={{ height: '100%' }}>
      <Flex vertical gap={8} style={{ padding: 12 }}>
        <Input
          allowClear
          prefix={<Search20Regular />}
          placeholder={t('chat.searchSessions')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Segmented
          block
          size="small"
          value={archived ? 'archived' : 'active'}
          onChange={(v) => setArchived(v === 'archived')}
          options={[
            { value: 'active', label: t('chat.active') },
            { value: 'archived', label: t('chat.archived') },
          ]}
        />
      </Flex>
      <div className="cz-scroll" style={{ flex: 1, minHeight: 0, padding: '0 4px' }}>
        <Conversations
          items={items}
          activeKey={activeId ?? undefined}
          onActiveChange={(key) => navigate(`/sessions/${key}`)}
          groupable
          creation={{ label: t('chat.newSession'), onClick: () => navigate('/sessions/new') }}
          styles={{ root: { padding: 0 }, item: { borderRadius: token.borderRadius } }}
          menu={(conv) => {
            const s = list.data?.find((x) => x.id === conv.key);
            return {
              items: [
                {
                  key: 'pin',
                  icon: s?.pinned ? <PinOff16Regular /> : <Pin16Regular />,
                  label: s?.pinned ? t('chat.unpin') : t('chat.pin'),
                },
                {
                  key: 'archive',
                  icon: <Archive16Regular />,
                  label: s?.archived ? t('chat.unarchive') : t('chat.archive'),
                },
                { key: 'delete', icon: <Delete16Regular />, label: t('common.delete'), danger: true },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (!s) return;
                if (key === 'pin') void patch(s.id, { pinned: !s.pinned });
                if (key === 'archive') void patch(s.id, { archived: !s.archived });
                if (key === 'delete') {
                  modal.confirm({
                    title: t('chat.deleteConfirm'),
                    okButtonProps: { danger: true },
                    onOk: async () => {
                      await api.del(`/sessions/${s.id}`);
                      if (activeId === s.id) navigate('/sessions');
                    },
                  });
                }
              },
            };
          }}
        />
      </div>
    </Flex>
  );
}
