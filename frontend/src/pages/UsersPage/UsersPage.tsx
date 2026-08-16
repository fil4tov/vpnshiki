import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiClock, FiEdit3, FiKey, FiPlus, FiSearch, FiTrash2, FiUsers } from 'react-icons/fi';

import {
  adminUsersKey,
  createUser,
  deleteUser,
  getUsers,
  resetUserPassword,
  updateUser,
  useUserStore,
} from '#entities/user';
import type { AdminUser, AdminUserPayload, AdminUserUpdatePayload, User } from '#entities/user';
import { formatMoney, isNegativeMoney } from '#shared/lib/money';
import { Badge, Button, LoadingState, Modal, Surface } from '#shared/ui';

import { ChargeHistoryModal, DeleteUserConfirmation, ResetPasswordForm, UserForm } from './components';
import styles from './UsersPage.module.scss';

export function UsersPage() {
  const currentUser = useUserStore((state) => state.user)!;
  const setCurrentUser = useUserStore((state) => state.setUser);
  const logout = useUserStore((state) => state.logout);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [historyUser, setHistoryUser] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const usersQuery = useQuery({ queryKey: adminUsersKey, queryFn: getUsers });

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: adminUsersKey }); };
  const createMutation = useMutation({ mutationFn: createUser, onSuccess: refresh });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminUserUpdatePayload }) => updateUser(id, payload),
    onSuccess: async (user) => { if (user.id === currentUser.id) setCurrentUser(user); await refresh(); },
  });
  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, password),
  });
  const deleteMutation = useMutation({ mutationFn: deleteUser, onSuccess: refresh });

  const users = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((user) => user.name.toLowerCase().includes(value));
  }, [search, usersQuery.data]);
  const activeCount = (usersQuery.data ?? []).filter((user) => user.account_status === 'active').length;
  const pausedCount = (usersQuery.data ?? []).filter((user) => user.account_status === 'paused').length;
  const blockedCount = (usersQuery.data ?? []).filter((user) => user.account_status === 'blocked').length;

  const saveCreate = async (payload: AdminUserPayload | AdminUserUpdatePayload) => {
    await createMutation.mutateAsync(payload as AdminUserPayload);
    setCreateOpen(false);
  };
  const saveEdit = async (payload: AdminUserPayload | AdminUserUpdatePayload) => {
    if (!editing) return;
    await updateMutation.mutateAsync({ id: editing.id, payload: payload as AdminUserUpdatePayload });
    setEditing(null);
  };
  const savePassword = async (password: string) => {
    if (!resetting) return;
    const resettingSelf = resetting.id === currentUser.id;
    await resetMutation.mutateAsync({ id: resetting.id, password });
    setResetting(null);
    if (resettingSelf) await logout();
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><p>Управление доступом</p><h1>Пользователи</h1></div>
        <Button onClick={() => setCreateOpen(true)}><FiPlus />Добавить</Button>
      </header>
      <section className={styles.summary} aria-label="Сводка пользователей">
        <Surface><FiUsers /><div><span>Всего</span><strong>{usersQuery.data?.length ?? 0}</strong></div></Surface>
        <Surface><span className={styles.liveDot} /><div><span>Участвуют</span><strong>{activeCount}</strong></div></Surface>
        <Surface><span className={styles.pausedDot} /><div><span>Приостановлены</span><strong>{pausedCount}</strong></div></Surface>
        <Surface><span className={styles.blockedDot} /><div><span>Заблокированы</span><strong>{blockedCount}</strong></div></Surface>
      </section>
      <Surface className={styles.directory}>
        <div className={styles.toolbar}>
          <div><h2>Все аккаунты</h2><span>{users.length} в списке</span></div>
          <label className={styles.search}><FiSearch /><span className={styles.srOnly}>Поиск</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти по имени" /></label>
        </div>
        {usersQuery.isLoading ? <LoadingState label="Загружаем пользователей" /> : usersQuery.isError ? (
          <div className={styles.empty}><p>Не удалось загрузить пользователей.</p><Button variant="secondary" onClick={() => void usersQuery.refetch()}>Повторить</Button></div>
        ) : users.length === 0 ? (
          <div className={styles.empty}><p>{search ? 'По этому запросу никого нет.' : 'Добавьте первого участника.'}</p></div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Пользователь</th><th>Статус</th><th>Баланс</th><th>Лимит</th><th>Всего списаний</th><th>История списаний</th><th><span className={styles.srOnly}>Действия</span></th></tr></thead>
              <tbody>{users.map((user) => (
                <tr key={user.id}>
                  <td data-label="Пользователь"><div className={styles.person}><span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Администратор' : 'Участник'}</small></div></div></td>
                  <td data-label="Статус"><Badge tone={user.account_status === 'blocked' ? 'danger' : user.account_status === 'active' ? 'positive' : 'warning'}>{user.account_status === 'blocked' ? 'Заблокирован' : user.account_status === 'active' ? 'Активен' : 'Приостановлен'}</Badge></td>
                  <td
                    data-label="Баланс"
                    className={`${styles.money} ${isNegativeMoney(user.balance) ? styles.negativeMoney : ''}`}
                  >
                    {formatMoney(user.balance)}
                  </td>
                  <td data-label="Лимит" className={styles.money}>{formatMoney(user.negative_balance_limit)}</td>
                  <td data-label="Всего списаний" className={styles.money}>{formatMoney(user.total_charged)}</td>
                  <td data-label="История списаний" className={styles.historyCell}>
                    <button type="button" onClick={() => setHistoryUser(user)} aria-label={`Открыть историю списаний ${user.name}`}>
                      <FiClock aria-hidden="true" />
                      <span>Открыть</span>
                    </button>
                  </td>
                  <td className={styles.rowActions}>
                    <button type="button" onClick={() => setEditing(user)} aria-label={`Редактировать ${user.name}`}><FiEdit3 /></button>
                    <button type="button" onClick={() => setResetting(user)} aria-label={`Сбросить пароль ${user.name}`}><FiKey /></button>
                    <button
                      className={styles.deleteAction}
                      type="button"
                      disabled={user.id === currentUser.id}
                      title={user.id === currentUser.id ? 'Нельзя удалить собственный аккаунт' : 'Удалить пользователя'}
                      onClick={() => setDeleting(user)}
                      aria-label={`Удалить ${user.name}`}
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Surface>
      <Modal open={createOpen} title="Новый пользователь" onClose={() => setCreateOpen(false)}><UserForm onCancel={() => setCreateOpen(false)} onSubmit={saveCreate} /></Modal>
      <Modal open={Boolean(editing)} title="Настройки пользователя" onClose={() => setEditing(null)}>{editing && <UserForm user={editing} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}</Modal>
      <Modal open={Boolean(resetting)} title="Сбросить пароль" onClose={() => setResetting(null)}>{resetting && <ResetPasswordForm name={resetting.name} onCancel={() => setResetting(null)} onSubmit={savePassword} />}</Modal>
      {historyUser && <ChargeHistoryModal user={historyUser} onClose={() => setHistoryUser(null)} />}
      <Modal open={Boolean(deleting)} title="Удалить пользователя" onClose={() => setDeleting(null)}>{deleting && <DeleteUserConfirmation name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}</Modal>
    </div>
  );
}
