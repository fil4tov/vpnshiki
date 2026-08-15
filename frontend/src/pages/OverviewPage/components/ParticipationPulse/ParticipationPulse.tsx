import { FiLock, FiPause, FiRadio } from 'react-icons/fi';

import type { AccountStatus } from '#entities/user';
import { formatMoney } from '#shared/lib/money';

import styles from './ParticipationPulse.module.scss';

interface ParticipationPulseProps {
  accountStatus: AccountStatus;
  balance: string;
  negativeBalanceLimit: string;
  dailyCharge: string | null | undefined;
}

export function ParticipationPulse({ accountStatus, balance, negativeBalanceLimit, dailyCharge }: ParticipationPulseProps) {
  const active = accountStatus === 'active';
  const blocked = accountStatus === 'blocked';
  const status = blocked ? 'Заблокирован' : active ? 'Активен' : 'Приостановлен';
  const title = blocked ? 'Аккаунт заблокирован' : active ? 'Вы участвуете' : 'Участие приостановлено';
  const description = blocked
    ? 'Статус сможет изменить администратор после пополнения баланса.'
    : active
      ? 'Ваш аккаунт включён в общий расчёт.'
      : 'Со следующего расчётного дня списаний не будет.';
  return (
    <section className={`${styles.pulse} ${styles[accountStatus]}`} aria-label="Статус участия и баланс">
      <div className={styles.topLine}>
        <div className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div><span>Статус аккаунта</span><strong>{status}</strong></div>
        </div>
        <div className={styles.dailyCharge}>
          <span><i aria-hidden="true" />Суточное списание</span>
          <strong>{dailyCharge === undefined ? '…' : dailyCharge === null ? '—' : formatMoney(dailyCharge)}</strong>
        </div>
      </div>
      <div className={styles.mainContent}>
        <div className={styles.orbit} aria-hidden="true"><div className={styles.core}>{blocked ? <FiLock /> : active ? <FiRadio /> : <FiPause />}</div></div>
        <div className={styles.copy}>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.finances}>
          <div className={styles.balance}>
            <span>Текущий баланс</span>
            <strong>{formatMoney(balance)}</strong>
            <small>Лимит минуса: {formatMoney(negativeBalanceLimit)}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
