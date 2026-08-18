import { FiLock, FiPause, FiRadio } from 'react-icons/fi';

import type { AccountBlockSource, AccountStatus } from '#entities/user';
import { formatMoney, isNegativeMoney } from '#shared/lib/money';

import { ActivationControl } from './components';
import styles from './ParticipationPulse.module.scss';

interface ParticipationPulseProps {
  accountStatus: AccountStatus;
  blockSource: AccountBlockSource | null;
  balance: string;
  negativeBalanceLimit: string;
  dailyCharge: string | null | undefined;
}

export function ParticipationPulse({ accountStatus, blockSource, balance, negativeBalanceLimit, dailyCharge }: ParticipationPulseProps) {
  const active = accountStatus === 'active';
  const blocked = accountStatus === 'blocked';
  const status = blocked ? 'Заблокирован' : active ? 'Активен' : 'Приостановлен';
  const title = blocked ? 'Аккаунт заблокирован' : active ? 'Аккаунт активен' : 'Аккаунт приостановлен';
  const description = blocked
    ? blockSource === 'billing'
      ? 'Пополните баланс для разблокировки.'
      : 'Обратитесь к администратору.'
    : active
      ? 'Ваш аккаунт включён в общий расчёт.'
      : 'Списания отменены, VPN-профиль заблокирован.';
  return (
    <section className={`${styles.pulse} ${styles[accountStatus]}`} aria-label="Статус участия и баланс">
      <div className={styles.topLine}>
        <div className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div><span>Статус аккаунта</span><strong>{status}</strong></div>
        </div>
        {active && dailyCharge === undefined ? (
          <div
            className={`${styles.dailyCharge} ${styles.dailyChargeSkeleton}`}
            role="status"
            aria-label="Загрузка суточного списания"
          />
        ) : active ? (
          <div
            className={styles.dailyCharge}
            data-tone="active"
          >
            <span><i aria-hidden="true" />Суточное списание</span>
            <strong>{dailyCharge == null ? '—' : formatMoney(dailyCharge)}</strong>
          </div>
        ) : accountStatus === 'paused' ? (
          <ActivationControl balance={balance} negativeBalanceLimit={negativeBalanceLimit} />
        ) : null}
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
            <strong className={isNegativeMoney(balance) ? styles.negativeBalance : undefined}>
              {formatMoney(balance)}
            </strong>
            <small>Лимит минуса: {formatMoney(negativeBalanceLimit)}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
