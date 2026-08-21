import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiClock, FiEdit3, FiKey, FiPlus, FiSearch, FiTrash2, FiUsers } from 'react-icons/fi';

import {
  adminUsersKey,
  ChargeHistoryModal,
  createUser,
  deleteUser,
  getUsers,
  resetUserPassword,
  TopUpHistoryModal,
  updateUser,
  useUserStore,
} from '#entities/user';
import type { AdminUser, AdminUserPayload, AdminUserUpdatePayload, User } from '#entities/user';
import { formatMoney, isNegativeMoney } from '#shared/lib/money';
import {
  Badge,
  Button,
  DataTable,
  LoadingState,
  Modal,
  SummaryCard,
  SummaryCards,
  Surface,
  TableActionButton,
} from '#shared/ui';
import type { DataTableColumn } from '#shared/ui';

import {
  CopyUserIdButton,
  DeleteUserConfirmation,
  ResetPasswordForm,
  StatusHistoryModal,
  UserForm,
} from './components';
import styles from './UsersPage.module.scss';

const accountStatusView = {
  active: { label: 'Активен', tone: 'positive' },
  paused: { label: 'Приостановлен', tone: 'warning' },
  blocked: { label: 'Заблокирован', tone: 'danger' },
} as const;

const vpnStatusView = {
  online: { label: 'В сети', tone: 'positive' },
  offline: { label: 'Не в сети', tone: 'neutral' },
  unknown: { label: 'Неизвестно', tone: 'warning' },
} as const;

const userCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

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
  const [topUpHistoryUser, setTopUpHistoryUser] = useState<AdminUser | null>(null);
  const [statusHistoryUser, setStatusHistoryUser] = useState<AdminUser | null>(null);
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
    return (usersQuery.data ?? []).filter((user) =>
      user.name.toLowerCase().includes(value),
    );
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
  const userColumns: DataTableColumn<AdminUser>[] = [
    {
      id: 'id',
      label: 'ID',
      headerClassName: styles.idColumn,
      cellClassName: styles.idColumn,
      render: (user) => <CopyUserIdButton id={user.id} name={user.name} />,
    },
    {
      id: 'name',
      label: 'Пользователь',
      compare: (left, right) => userCollator.compare(right.name, left.name),
      cellClassName: styles.personCell,
      render: (user) => (
        <div className={styles.person}>
          <span>{user.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Администратор' : 'Участник'}</small></div>
        </div>
      ),
    },
    {
      id: 'accountStatus',
      label: 'Статус',
      compare: (left, right) => userCollator.compare(
        accountStatusView[left.account_status].label,
        accountStatusView[right.account_status].label,
      ),
      render: (user) => {
        const accountView = accountStatusView[user.account_status];
        return (
          <div className={styles.statusValue}>
            <Badge tone={accountView.tone}>{accountView.label}</Badge>
            <TableActionButton
              className={styles.historyButton}
              title="История статуса"
              onClick={() => setStatusHistoryUser(user)}
              aria-label={`Открыть историю статуса ${user.name}`}
            ><FiClock aria-hidden="true" /></TableActionButton>
          </div>
        );
      },
    },
    {
      id: 'vpnStatus',
      label: 'VPN',
      compare: (left, right) => userCollator.compare(
        vpnStatusView[left.vpnStatus].label,
        vpnStatusView[right.vpnStatus].label,
      ),
      cellClassName: styles.vpnStatus,
      render: (user) => {
        const vpnView = vpnStatusView[user.vpnStatus];
        return <Badge tone={vpnView.tone}>{vpnView.label}</Badge>;
      },
    },
    {
      id: 'balance',
      label: 'Баланс',
      compare: (left, right) => Number(left.balance) - Number(right.balance),
      cellClassName: (user) => `${styles.money} ${isNegativeMoney(user.balance) ? styles.negativeMoney : ''}`,
      render: (user) => formatMoney(user.balance),
    },
    {
      id: 'negativeBalanceLimit',
      label: 'Лимит',
      compare: (left, right) => Number(left.negative_balance_limit) - Number(right.negative_balance_limit),
      cellClassName: styles.money,
      render: (user) => formatMoney(user.negative_balance_limit),
    },
    {
      id: 'totalCharged',
      label: 'Всего списаний',
      compare: (left, right) => Number(left.total_charged) - Number(right.total_charged),
      cellClassName: styles.money,
      render: (user) => (
        <div className={styles.transactionTotal}>
          <span>{formatMoney(user.total_charged)}</span>
          <TableActionButton
            className={styles.historyButton}
            title="История списаний"
            onClick={() => setHistoryUser(user)}
            aria-label={`Открыть историю списаний ${user.name}`}
          ><FiClock aria-hidden="true" /></TableActionButton>
        </div>
      ),
    },
    {
      id: 'totalTopUps',
      label: 'Всего пополнений',
      compare: (left, right) => Number(left.total_top_ups) - Number(right.total_top_ups),
      cellClassName: styles.money,
      render: (user) => (
        <div className={styles.transactionTotal}>
          <span>{formatMoney(user.total_top_ups)}</span>
          <TableActionButton
            className={styles.historyButton}
            title="История пополнений"
            onClick={() => setTopUpHistoryUser(user)}
            aria-label={`Открыть историю пополнений ${user.name}`}
          ><FiClock aria-hidden="true" /></TableActionButton>
        </div>
      ),
    },
    {
      id: 'actions',
      label: 'Действия',
      headerVisuallyHidden: true,
      cellClassName: styles.rowActions,
      render: (user) => (
        <>
          <button type="button" onClick={() => setEditing(user)} aria-label={`Редактировать ${user.name}`}><FiEdit3 /></button>
          <button type="button" onClick={() => setResetting(user)} aria-label={`Сбросить пароль ${user.name}`}><FiKey /></button>
          <button
            className={styles.deleteAction}
            type="button"
            disabled={user.id === currentUser.id}
            title={user.id === currentUser.id ? 'Нельзя удалить собственный аккаунт' : 'Удалить пользователя'}
            onClick={() => setDeleting(user)}
            aria-label={`Удалить ${user.name}`}
          ><FiTrash2 /></button>
        </>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><p>Управление доступом</p><h1>Пользователи</h1></div>
        <Button onClick={() => setCreateOpen(true)}><FiPlus />Добавить</Button>
      </header>
      <SummaryCards aria-label="Сводка пользователей">
        <SummaryCard label="Всего" value={usersQuery.data?.length ?? 0} icon={<FiUsers />} />
        <SummaryCard label="Активны" value={activeCount} indicator tone="positive" />
        <SummaryCard label="Приостановлены" value={pausedCount} indicator tone="warning" />
        <SummaryCard label="Заблокированы" value={blockedCount} indicator tone="danger" />
      </SummaryCards>
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
          <DataTable
            className={styles.tableWrap}
            rows={users}
            columns={userColumns}
            getRowKey={(user) => user.id}
          />
        )}
      </Surface>
      <Modal open={createOpen} title="Новый пользователь" onClose={() => setCreateOpen(false)}><UserForm onCancel={() => setCreateOpen(false)} onSubmit={saveCreate} /></Modal>
      <Modal open={Boolean(editing)} title="Настройки пользователя" onClose={() => setEditing(null)}>{editing && <UserForm user={editing} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}</Modal>
      <Modal open={Boolean(resetting)} title="Сбросить пароль" onClose={() => setResetting(null)}>{resetting && <ResetPasswordForm name={resetting.name} onCancel={() => setResetting(null)} onSubmit={savePassword} />}</Modal>
      {historyUser && (
        <ChargeHistoryModal
          user={historyUser}
          mode="admin"
          total={historyUser.total_charged}
          onClose={() => setHistoryUser(null)}
        />
      )}
      {topUpHistoryUser && (
        <TopUpHistoryModal
          user={topUpHistoryUser}
          mode="admin"
          total={topUpHistoryUser.total_top_ups}
          onClose={() => setTopUpHistoryUser(null)}
        />
      )}
      {statusHistoryUser && (
        <StatusHistoryModal user={statusHistoryUser} onClose={() => setStatusHistoryUser(null)} />
      )}
      <Modal open={Boolean(deleting)} title="Удалить пользователя" onClose={() => setDeleting(null)}>{deleting && <DeleteUserConfirmation name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}</Modal>
    </div>
  );
}
