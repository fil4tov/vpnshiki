import { useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

import { ApiError } from '#shared/api';
import { Button } from '#shared/ui';

import styles from './DeleteTariffPlanConfirmation.module.scss';

interface DeleteTariffPlanConfirmationProps {
  name: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteTariffPlanConfirmation({
  name,
  onCancel,
  onConfirm,
}: DeleteTariffPlanConfirmationProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setPending(true);
    setError('');
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось удалить тарифный план');
      setPending(false);
    }
  };

  return (
    <div className={styles.content}>
      <div className={styles.warning}>
        <span className={styles.icon}><FiAlertTriangle aria-hidden="true" /></span>
        <div>
          <strong>Удалить {name}?</strong>
          <p>Соседние периоды будут соединены автоматически, без разрыва в расписании.</p>
        </div>
      </div>
      <p className={styles.notice}>Это действие нельзя отменить.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions} data-modal-footer>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Отмена</Button>
        <Button type="button" variant="danger" loading={pending} onClick={() => void confirm()}>
          Удалить план
        </Button>
      </div>
    </div>
  );
}
