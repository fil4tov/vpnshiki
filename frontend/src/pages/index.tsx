import { useEffect } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

import { useUserStore } from '#entities/user';
import { LoadingState } from '#shared/ui';
import { AppShell } from '#widgets/AppShell';

import { LoginPage } from './LoginPage';
import { OverviewPage } from './OverviewPage';
import { UsersPage } from './UsersPage';

interface PagesProps { theme: 'light' | 'dark'; toggleTheme: () => void }

export function Pages({ theme, toggleTheme }: PagesProps) {
  const status = useUserStore((state) => state.status);
  const user = useUserStore((state) => state.user);
  const initialize = useUserStore((state) => state.initialize);
  useEffect(() => { void initialize(); }, [initialize]);

  const routes = useRoutes([
    { path: '/login', element: status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage /> },
    {
      element: status === 'authenticated' ? <AppShell theme={theme} toggleTheme={toggleTheme} /> : <Navigate to="/login" replace />,
      children: [
        { path: '/', element: <OverviewPage /> },
        { path: '/users', element: user?.role === 'admin' ? <UsersPage /> : <Navigate to="/" replace /> },
      ],
    },
    { path: '*', element: <Navigate to={status === 'authenticated' ? '/' : '/login'} replace /> },
  ]);

  if (status === 'checking') return <LoadingState label="Проверяем доступ" />;
  return routes;
}

