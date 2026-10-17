import { useQueryClient } from '@tanstack/react-query';
import { Spin } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { setUnauthorizedHandler } from '../api/client.ts';
import { qk, useAuthState } from '../api/queries.ts';
import { stream } from '../api/stream.ts';
import { LoginPage } from './LoginPage.tsx';
import { SetupPage } from './SetupPage.tsx';

export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const auth = useAuthState();

  useEffect(() => {
    setUnauthorizedHandler(() => void qc.invalidateQueries({ queryKey: qk.auth }));
  }, [qc]);

  const authenticated = auth.data?.authenticated === true;
  useEffect(() => {
    if (authenticated) stream.start();
    else stream.stop();
  }, [authenticated]);

  if (auth.isLoading) return <Spin fullscreen />;
  if (auth.data?.setupRequired) return <SetupPage />;
  if (!authenticated) return <LoginPage />;
  return <>{children}</>;
}
