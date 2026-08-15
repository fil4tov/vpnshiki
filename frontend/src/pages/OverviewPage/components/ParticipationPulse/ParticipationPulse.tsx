import { FiLock, FiPause, FiRadio } from 'react-icons/fi';

import { Badge, Switch } from '#shared/ui';

import styles from './ParticipationPulse.module.scss';

interface ParticipationPulseProps {
  active: boolean;
  blocked: boolean;
  pending: boolean;
  onChange: (active: boolean) => void;
}

export function ParticipationPulse({ active, blocked, pending, onChange }: ParticipationPulseProps) {
  const mode = blocked ? 'blocked' : active ? 'active' : 'paused';
  const title = blocked ? 'Аккаунт заблокирован' : active ? 'Вы участвуете' : 'Участие на паузе';
  const description = blocked
    ? 'Статус сможет изменить администратор после пополнения баланса.'
    : active
      ? 'Ваш аккаунт включён в общий расчёт.'
      : 'Со следующего расчётного дня списаний не будет.';
  return (
    <div className={`${styles.pulse} ${styles[mode]}`}>
      <div className={styles.orbit} aria-hidden="true"><div className={styles.core}>{blocked ? <FiLock /> : active ? <FiRadio /> : <FiPause />}</div></div>
      <div className={styles.content}>
        <Badge tone={blocked ? 'danger' : active ? 'positive' : 'warning'}>
          {blocked ? 'Заблокирован' : active ? 'Активен' : 'Приостановлен'}
        </Badge>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.control}>
        <span>{active ? 'Участие включено' : 'Участие выключено'}</span>
        <Switch checked={active} label="Участие в программе" disabled={blocked || pending} onClick={() => onChange(!active)} />
      </div>
    </div>
  );
}

