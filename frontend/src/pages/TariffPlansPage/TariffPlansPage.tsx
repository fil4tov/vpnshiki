import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiCalendar, FiClock, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';

import {
  createTariffPlan,
  deleteTariffPlan,
  formatCalendarDate,
  getTariffPlans,
  tariffPlansKey,
  updateTariffPlan,
} from '#entities/tariffPlan';
import type { TariffPlan, TariffPlanPayload } from '#entities/tariffPlan';
import { adminUsersKey, getUsers } from '#entities/user';
import { formatMoney } from '#shared/lib/money';
import { Badge, Button, LoadingState, Modal, Surface, TableActionButton } from '#shared/ui';

import {
  CurrentTariffCard,
  DeleteTariffPlanConfirmation,
  TariffPlanBillingHistoryModal,
  TariffPlanForm,
} from './components';
import styles from './TariffPlansPage.module.scss';

const statusView = {
  active: { label: 'Действует', tone: 'positive' },
  scheduled: { label: 'Запланирован', tone: 'accent' },
  completed: { label: 'Завершён', tone: 'neutral' },
} as const;

export function TariffPlansPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TariffPlan | null>(null);
  const [deleting, setDeleting] = useState<TariffPlan | null>(null);
  const [historyPlan, setHistoryPlan] = useState<TariffPlan | null>(null);
  const plansQuery = useQuery({ queryKey: tariffPlansKey, queryFn: getTariffPlans });
  const plans = plansQuery.data ?? [];
  const currentPlan = plans.find((plan) => plan.status === 'active');
  const usersQuery = useQuery({
    queryKey: adminUsersKey,
    queryFn: getUsers,
    enabled: Boolean(currentPlan),
  });
  const activeUsers = usersQuery.data?.filter((user) => user.account_status === 'active').length;
  const displayedPlans = [...plans].sort((left, right) => (
    right.start_date.localeCompare(left.start_date)
  ));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: tariffPlansKey });
  };
  const createMutation = useMutation({ mutationFn: createTariffPlan, onSuccess: refresh });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TariffPlanPayload }) => (
      updateTariffPlan(id, payload)
    ),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({ mutationFn: deleteTariffPlan, onSuccess: refresh });

  const saveCreate = async (payload: TariffPlanPayload) => {
    await createMutation.mutateAsync(payload);
    setCreateOpen(false);
  };
  const saveEdit = async (payload: TariffPlanPayload) => {
    if (!editing) return;
    await updateMutation.mutateAsync({ id: editing.id, payload });
    setEditing(null);
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Расписание стоимости</p>
          <h1>Тарифные планы</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}><FiPlus />Добавить план</Button>
      </header>

      {!plansQuery.isLoading && !plansQuery.isError && (
        <CurrentTariffCard
          plan={currentPlan}
          activeUsers={activeUsers}
          usersError={usersQuery.isError}
        />
      )}

      <Surface className={styles.directory}>
        <div className={styles.toolbar}>
          <div><h2>Расписание</h2><span>{plans.length} {plans.length === 1 ? 'план' : 'планов'}</span></div>
          <div className={styles.timezone}><FiCalendar aria-hidden="true" /><span>Москва · UTC+3</span></div>
        </div>
        {plansQuery.isLoading ? <LoadingState label="Загружаем тарифные планы" /> : plansQuery.isError ? (
          <div className={styles.empty}>
            <p>Не удалось загрузить тарифные планы.</p>
            <Button variant="secondary" onClick={() => void plansQuery.refetch()}>Повторить</Button>
          </div>
        ) : plans.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><FiCalendar aria-hidden="true" /></span>
            <div><strong>Расписание пока пустое</strong><p>Создайте первый план — его можно начать с нужной исторической даты.</p></div>
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>Создать первый план</Button>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr><th>Название</th><th>Сумма за месяц</th><th>Начало</th><th>Окончание</th><th>Статус</th><th>История списаний</th><th><span className={styles.srOnly}>Действия</span></th></tr>
              </thead>
              <tbody>{displayedPlans.map((plan) => {
                const view = statusView[plan.status];
                return (
                  <tr key={plan.id}>
                    <td data-label="Название">
                      <div className={styles.planIdentity}>
                        <span className={`${styles.planMark} ${styles[plan.status]}`} aria-hidden="true"><FiCalendar /></span>
                        <strong>{plan.name}</strong>
                      </div>
                    </td>
                    <td data-label="Сумма" className={styles.money}>{formatMoney(plan.monthly_amount)}</td>
                    <td data-label="Начало" className={styles.date}><time dateTime={plan.start_date}>{formatCalendarDate(plan.start_date)}</time></td>
                    <td data-label="Окончание" className={styles.date}>{plan.end_date ? <time dateTime={plan.end_date}>{formatCalendarDate(plan.end_date)}</time> : 'Бессрочно'}</td>
                    <td data-label="Статус"><Badge tone={view.tone}>{view.label}</Badge></td>
                    <td data-label="История списаний">
                      <TableActionButton
                        aria-label={`Открыть историю списаний ${plan.name}`}
                        onClick={() => setHistoryPlan(plan)}
                      >
                        <FiClock aria-hidden="true" />
                        <span>Открыть</span>
                      </TableActionButton>
                    </td>
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        disabled={!plan.is_editable}
                        title={plan.is_editable ? 'Редактировать план' : 'Начавшийся план нельзя изменить'}
                        aria-label={`Редактировать ${plan.name}`}
                        onClick={() => setEditing(plan)}
                      ><FiEdit3 /></button>
                      <button
                        className={styles.deleteAction}
                        type="button"
                        disabled={!plan.is_editable}
                        title={plan.is_editable ? 'Удалить план' : 'Начавшийся план нельзя удалить'}
                        aria-label={`Удалить ${plan.name}`}
                        onClick={() => setDeleting(plan)}
                      ><FiTrash2 /></button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Surface>

      <Modal open={createOpen} title="Новый тарифный план" onClose={() => setCreateOpen(false)}>
        <TariffPlanForm plans={plans} onCancel={() => setCreateOpen(false)} onSubmit={saveCreate} />
      </Modal>
      <Modal open={Boolean(editing)} title="Изменить тарифный план" onClose={() => setEditing(null)}>
        {editing && <TariffPlanForm plan={editing} plans={plans} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}
      </Modal>
      <Modal open={Boolean(deleting)} title="Удалить тарифный план" onClose={() => setDeleting(null)}>
        {deleting && <DeleteTariffPlanConfirmation name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
      </Modal>
      {historyPlan && (
        <TariffPlanBillingHistoryModal plan={historyPlan} onClose={() => setHistoryPlan(null)} />
      )}
    </div>
  );
}
