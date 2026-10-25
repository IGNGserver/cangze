import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from './api/client.ts';
import { AuthGate } from './auth/AuthGate.tsx';
import { AppShell } from './layout/AppShell.tsx';
import { Home } from './pages/Home.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

// Pages are split into their own chunks so the first paint only loads the shell.
const DevicesPage = lazy(() =>
  import('./pages/devices/DevicesPage.tsx').then((m) => ({ default: m.DevicesPage })),
);
const SessionsPage = lazy(() =>
  import('./pages/sessions/SessionsPage.tsx').then((m) => ({ default: m.SessionsPage })),
);
const AgentsPage = lazy(() =>
  import('./pages/agents/AgentsPage.tsx').then((m) => ({ default: m.AgentsPage })),
);
const AutomationsPage = lazy(() =>
  import('./pages/automations/AutomationsPage.tsx').then((m) => ({ default: m.AutomationsPage })),
);
const LogsPage = lazy(() => import('./pages/logs/LogsPage.tsx').then((m) => ({ default: m.LogsPage })));
const WelcomePage = lazy(() => import('./pages/WelcomePage.tsx').then((m) => ({ default: m.WelcomePage })));
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthGate>
          <BrowserRouter>
            <ErrorBoundary>
              <Suspense fallback={<Spin fullscreen />}>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<Home />} />
                    <Route path="/sessions" element={<SessionsPage />} />
                    <Route path="/sessions/new" element={<SessionsPage />} />
                    <Route path="/sessions/:id" element={<SessionsPage />} />
                    <Route path="/agents/:id?" element={<AgentsPage />} />
                    <Route path="/automations" element={<AutomationsPage />} />
                    <Route path="/devices" element={<DevicesPage />} />
                    <Route path="/logs" element={<LogsPage />} />
                    <Route path="/welcome" element={<WelcomePage />} />
                    <Route path="/settings/:tab?" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/sessions" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </AuthGate>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
