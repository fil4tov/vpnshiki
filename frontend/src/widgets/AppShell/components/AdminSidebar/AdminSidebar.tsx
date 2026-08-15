import { FiCalendar, FiUsers } from 'react-icons/fi';
import { NavLink } from 'react-router-dom';

import styles from './AdminSidebar.module.scss';

export function AdminSidebar() {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.navigation} aria-label="Навигация администратора">
        <NavLink to="/admin/users" className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
          <FiUsers aria-hidden="true" />
          <span>Пользователи</span>
        </NavLink>
        <NavLink to="/admin/tariff-plans" className={({ isActive }) => isActive ? styles.activeLink : styles.link}>
          <FiCalendar aria-hidden="true" />
          <span>Тарифные планы</span>
        </NavLink>
      </nav>
    </aside>
  );
}
