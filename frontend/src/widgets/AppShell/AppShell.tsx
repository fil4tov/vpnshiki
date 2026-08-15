import { FiHome, FiLogOut, FiMoon, FiSun, FiUsers } from 'react-icons/fi';
import { NavLink, Outlet } from 'react-router-dom';

import { useUserStore } from '#entities/user';
import { Badge, Button } from '#shared/ui';

import styles from './AppShell.module.scss';

interface AppShellProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export function AppShell({ theme, toggleTheme }: AppShellProps) {
  const user = useUserStore((state) => state.user);
  const logout = useUserStore((state) => state.logout);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">V</span>
          <div><strong>VPNщики</strong><span>делим честно</span></div>
        </div>
        <nav className={styles.navigation} aria-label="Основная навигация">
          <NavLink to="/" end className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
            <FiHome /><span>Обзор</span>
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/users" className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
              <FiUsers /><span>Пользователи</span>
            </NavLink>
          )}
        </nav>
        <div className={styles.profile}>
          <div className={styles.avatar}>{user?.name.slice(0, 1).toUpperCase()}</div>
          <div className={styles.identity}>
            <strong>{user?.name}</strong>
            <Badge tone={user?.role === 'admin' ? 'accent' : 'neutral'}>
              {user?.role === 'admin' ? 'Администратор' : 'Участник'}
            </Badge>
          </div>
          <Button variant="ghost" aria-label="Выйти" title="Выйти" onClick={() => void logout()}>
            <FiLogOut />
          </Button>
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}><span>V</span><strong>VPNщики</strong></div>
          <div className={styles.topbarActions}>
            <button className={styles.themeButton} type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>
              {theme === 'dark' ? <FiSun /> : <FiMoon />}
            </button>
            <button className={styles.mobileLogout} type="button" onClick={() => void logout()} aria-label="Выйти"><FiLogOut /></button>
          </div>
        </header>
        <main className={styles.content}><Outlet /></main>
        <nav className={styles.mobileNav} aria-label="Мобильная навигация">
          <NavLink to="/" end><FiHome /><span>Обзор</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/users"><FiUsers /><span>Люди</span></NavLink>}
        </nav>
      </div>
    </div>
  );
}

