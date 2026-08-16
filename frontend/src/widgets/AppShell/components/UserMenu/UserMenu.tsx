import { useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiKey, FiLogOut } from 'react-icons/fi';

import { ChangePasswordModal, useUserStore } from '#entities/user';

import styles from './UserMenu.module.scss';

export function UserMenu() {
  const user = useUserStore((state) => state.user);
  const logout = useUserStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    firstItemRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!passwordSuccess) return undefined;
    const timeout = window.setTimeout(() => setPasswordSuccess(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [passwordSuccess]);

  if (!user) return null;

  return (
    <>
      <div className={styles.root} ref={rootRef}>
        <button
          ref={triggerRef}
          className={styles.trigger}
          type="button"
          aria-label="Открыть меню пользователя"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.avatar}>{user.name.slice(0, 1).toUpperCase()}</span>
          <FiChevronDown aria-hidden="true" />
        </button>
        {open && (
          <div className={styles.dropdown} role="menu" aria-label="Меню пользователя">
            <div className={styles.identity}>
              <strong>{user.name}</strong>
            </div>
            <div className={styles.menuActions}>
              <button ref={firstItemRef} type="button" role="menuitem" onClick={() => { setOpen(false); setPasswordOpen(true); }}>
                <FiKey aria-hidden="true" />
                <span>Сменить пароль</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); void logout(); }}>
                <FiLogOut aria-hidden="true" />
                <span>Выйти</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onSuccess={() => setPasswordSuccess('Пароль изменён. Остальные сессии завершены.')}
      />
      {passwordSuccess && <p className={styles.success} role="status">{passwordSuccess}</p>}
    </>
  );
}
