import { Alert, Button, Empty, Flex, Spin } from 'antd';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors.ts';

/** Keep loading, failed and genuinely empty states distinct across data-backed pages. */
export function QueryState({
  loading,
  error,
  onRetry,
  empty,
  emptyDescription,
  children,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: boolean;
  emptyDescription: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (loading) return <Spin />;
  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message={errorText(t, error)}
        action={<Button onClick={onRetry}>{t('common.retry')}</Button>}
      />
    );
  }
  if (empty) return <Empty description={emptyDescription} />;
  return <>{children}</>;
}

export function QueryStateCentered(props: ComponentProps<typeof QueryState>) {
  return (
    <Flex align="center" justify="center" style={{ minHeight: 180 }}>
      <QueryState {...props} />
    </Flex>
  );
}
