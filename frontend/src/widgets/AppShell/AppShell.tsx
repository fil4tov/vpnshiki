import { Outlet, useLocation } from 'react-router-dom';

import { useUserStore } from '#entities/user';

import { AdminSidebar, AppHeader } from './components';
import styles from './AppShell.module.scss';

interface AppShellProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export function AppShell({ theme, toggleTheme }: AppShellProps) {
  const user = useUserStore((state) => state.user);
  const location = useLocation();
  const showAdminSidebar = user?.role === 'admin'
    && (location.pathname === '/admin' || location.pathname.startsWith('/admin/'));

  return (
    <div className={`${styles.shell} ${showAdminSidebar ? styles.adminShell : ''}`}>
      <AppHeader theme={theme} toggleTheme={toggleTheme} />
      {showAdminSidebar && <AdminSidebar />}
      <main className={styles.content}><Outlet /></main>
    </div>
  );
}
