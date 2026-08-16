import { FiMoon, FiSettings, FiSun } from 'react-icons/fi';
import { Link, useLocation } from 'react-router-dom';

import { useUserStore } from '#entities/user';

import { UserMenu } from '../UserMenu';
import styles from './AppHeader.module.scss';

interface AppHeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export function AppHeader({ theme, toggleTheme }: AppHeaderProps) {
  const user = useUserStore((state) => state.user);
  const location = useLocation();
  const inAdminPanel = location.pathname === '/admin'
    || location.pathname.startsWith('/admin/');

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} to="/" aria-label="VPNщики — личный обзор">
          <span className={styles.brandMark} aria-hidden="true">V</span>
          <strong>VPNщики</strong>
        </Link>
        <div className={styles.actions}>
          {user?.role === 'admin' && (
            <Link
              to={inAdminPanel ? '/' : '/admin/users'}
              className={`${styles.adminLink} ${inAdminPanel ? styles.activeAdminLink : ''}`}
            >
              <FiSettings aria-hidden="true" />
              <span>Админ-панель</span>
            </Link>
          )}
          <button
            className={styles.iconButton}
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          >
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
