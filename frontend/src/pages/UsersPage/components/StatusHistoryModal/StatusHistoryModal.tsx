import { useQuery } from '@tanstack/react-query';

import {
  getUserStatusHistory,
  userStatusHistoryKey,
} from '#entities/user';
import type {
  AccountStatus,
  AdminUser,
  StatusChangeSource,
  UserStatusHistory,
} from '#entities/user';
import { Button, LoadingState, Modal } from '#shared/ui';

import styles from './StatusHistoryModal.module.scss';

const MOSCOW_TIME_ZONE = 'Europe/Moscow';
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: MOSCOW_TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: MOSCOW_TIME_ZONE,
});
const currentSinceFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: MOSCOW_TIME_ZONE,
});

const statusLabels: Record<AccountStatus, string> = {
  active: 'Активен',
  paused: 'Приостановлен',
  blocked: 'Заблокирован',
};

const currentDescriptions: Record<AccountStatus, string> = {
  active: 'Аккаунт работает без ограничений',
  paused: 'Участие и списания приостановлены',
  blocked: 'Доступ к VPN заблокирован',
};

const sourceLabels: Record<StatusChangeSource, string> = {
  bootstrap: 'система',
  admin: 'админ',
  billing: 'биллинг',
  top_up: 'пополнение',
  user: 'пользователь',
};

function eventReason(event: UserStatusHistory) {
  if (event.previous_status === null) return 'Начальное состояние аккаунта';
  if (event.source === 'top_up') return 'Баланс снова в допустимых пределах';
  if (event.source === 'billing' && event.new_status === 'blocked') {
    return 'Превышен допустимый минус';
  }
  if (event.source === 'user') return 'Аккаунт активирован пользователем';
  if (event.source === 'admin') {
    if (event.new_status === 'active') return 'Аккаунт активирован администратором';
    if (event.new_status === 'paused') return 'Участие приостановлено вручную';
    return 'Аккаунт заблокирован вручную';
  }
  return 'Статус аккаунта изменён';
}

function eventMeta(event: UserStatusHistory) {
  if (event.source === 'top_up') return 'Автоматически после пополнения баланса';
  if (event.source === 'billing') return 'Автоматически по результатам биллинга';
  if (event.source === 'user') {
    return `Активировал ${event.changed_by_name ?? 'пользователь'}`;
  }
  if (event.source === 'admin') {
    return `Изменил ${event.changed_by_name ?? 'администратор'}`;
  }
  return 'Создано системой';
}

function StatusBadge({ status }: { status: AccountStatus | null }) {
  return (
    <span className={`${styles.status} ${status ? styles[status] : styles.initial}`}>
      {status ? statusLabels[status] : 'Создан'}
    </span>
  );
}

export function StatusHistoryModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const historyQuery = useQuery({
    queryKey: userStatusHistoryKey(user.id),
    queryFn: () => getUserStatusHistory(user.id),
  });
  const currentSince = historyQuery.data?.[0]?.effective_at;

  return (
    <Modal
      open
      title="История статуса"
      description={<span className={styles.subject}>{user.name}</span>}
      className={styles.modal}
      onClose={onClose}
    >
      <div className={`${styles.currentStrip} ${styles[user.account_status]}`}>
        <div>
          <span>Текущий период</span>
          <strong>{currentDescriptions[user.account_status]}</strong>
        </div>
        <div className={styles.currentStatus}>
          <StatusBadge status={user.account_status} />
          {currentSince && <small>с {currentSinceFormatter.format(new Date(currentSince))}</small>}
        </div>
      </div>

      {historyQuery.isLoading ? (
        <LoadingState label="Загружаем историю статуса" />
      ) : historyQuery.isError ? (
        <div className={styles.message}>
          <p>Не удалось загрузить историю статуса.</p>
          <Button variant="secondary" onClick={() => void historyQuery.refetch()}>Повторить</Button>
        </div>
      ) : historyQuery.data?.length === 0 ? (
        <div className={styles.message}><p>История статуса пока пуста.</p></div>
      ) : (
        <div className={styles.timeline}>
          {historyQuery.data?.map((event) => (
            <article key={event.id} className={styles.event}>
              <time className={styles.eventTime} dateTime={event.effective_at}>
                <strong>{dateFormatter.format(new Date(event.effective_at))}</strong>
                <span>{timeFormatter.format(new Date(event.effective_at))}</span>
              </time>
              <i className={styles.eventDot} aria-hidden="true" />
              <div className={styles.eventCard}>
                <div className={styles.transition}>
                  <StatusBadge status={event.previous_status} />
                  <span className={styles.arrow} aria-hidden="true">→</span>
                  <StatusBadge status={event.new_status} />
                </div>
                <h3>{eventReason(event)}</h3>
                <p>
                  {eventMeta(event)}
                  <span className={styles.source}>{sourceLabels[event.source]}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
