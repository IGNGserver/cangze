import type { RunStatus } from '@cangze/contracts';
import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';

const COLORS: Record<RunStatus, string> = {
  queued: 'default',
  running: 'processing',
  waiting_approval: 'warning',
  succeeded: 'success',
  failed: 'error',
  aborted: 'default',
  skipped: 'default',
};

export function RunStatusTag({ status }: { status: RunStatus }) {
  const { t } = useTranslation();
  return <Tag color={COLORS[status]}>{t(`agents.status.${status}`)}</Tag>;
}
