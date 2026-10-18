import { Spin } from 'antd';
import { Navigate } from 'react-router';
import { useHaStatus } from '../api/queries.ts';
import { useModelDefaults } from '../api/sessions.ts';
import { WELCOME_DONE_KEY } from './WelcomePage.tsx';

function welcomeDone(): boolean {
  try {
    return localStorage.getItem(WELCOME_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

/** Landing route: first-time users get the setup wizard, everyone else their sessions. */
export function Home() {
  const ha = useHaStatus();
  const defaults = useModelDefaults();
  if (ha.isLoading || defaults.isLoading) return <Spin fullscreen />;
  const needsSetup = ha.data?.state === 'unconfigured' || !defaults.data?.chat;
  return <Navigate to={needsSetup && !welcomeDone() ? '/welcome' : '/sessions'} replace />;
}
