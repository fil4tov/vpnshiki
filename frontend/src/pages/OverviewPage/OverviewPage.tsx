import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FiCreditCard, FiKey, FiShield } from 'react-icons/fi';

import { changeMyPassword, updateMyActivity, useUserStore } from '#entities/user';
import { ApiError } from '#shared/api';
import { formatMoney } from '#shared/lib/money';
import { Badge, Button, Modal, PasswordField, Surface } from '#shared/ui';

import { ParticipationPulse } from './components';
import styles from './OverviewPage.module.scss';

interface PasswordForm { currentPassword: string; newPassword: string; confirmPassword: string }

export function OverviewPage() {
  const user = useUserStore((state) => state.user)!;
  const setUser = useUserStore((state) => state.setUser);
  const [activityPending, setActivityPending] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const { register, handleSubmit, reset, setError, control, formState: { errors, isSubmitting } } = useForm<PasswordForm>();
  const newPassword = useWatch({ control, name: 'newPassword' });

  const changeActivity = async (active: boolean) => {
    setActivityPending(true);
    setActivityError('');
    try {
      setUser(await updateMyActivity(active));
    } catch (error) {
      setActivityError(error instanceof ApiError ? error.message : 'Не удалось изменить статус');
    } finally {
      setActivityPending(false);
    }
  };

  const closePassword = () => { setPasswordOpen(false); reset(); };
  const submitPassword = handleSubmit(async (values) => {
    try {
      setUser(await changeMyPassword(values.currentPassword, values.newPassword));
      closePassword();
      setPasswordSuccess('Пароль изменён. Остальные сессии завершены.');
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.current_password) {
        setError('currentPassword', { message: error.fieldErrors.current_password });
      } else {
        setError('root', { message: error instanceof ApiError ? error.message : 'Не удалось изменить пароль' });
      }
    }
  });

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><p>Личный обзор</p><h1>Привет, {user.name}</h1></div>
        <Badge tone={user.role === 'admin' ? 'accent' : 'neutral'}>{user.role === 'admin' ? 'Администратор' : 'Участник'}</Badge>
      </header>
      <ParticipationPulse active={user.is_active} blocked={user.is_blocked} pending={activityPending} onChange={(active) => void changeActivity(active)} />
      {activityError && <p className={styles.alert} role="alert">{activityError}</p>}
      {passwordSuccess && <p className={styles.success} role="status">{passwordSuccess}</p>}
      <section className={styles.metrics} aria-label="Данные аккаунта">
        <Surface className={styles.metric}>
          <span className={styles.metricIcon}><FiCreditCard /></span>
          <div><p>Текущий баланс</p><strong>{formatMoney(user.balance)}</strong><span>точно до копейки</span></div>
        </Surface>
        <Surface className={styles.metric}>
          <span className={styles.metricIcon}><FiShield /></span>
          <div><p>Допустимый минус</p><strong>{formatMoney(user.negative_balance_limit)}</strong><span>лимит до блокировки</span></div>
        </Surface>
        <Surface className={styles.metricAction}>
          <span className={styles.metricIcon}><FiKey /></span>
          <div><p>Безопасность</p><strong>Пароль аккаунта</strong><Button variant="secondary" onClick={() => { setPasswordSuccess(''); setPasswordOpen(true); }}>Изменить пароль</Button></div>
        </Surface>
      </section>
      <Modal open={passwordOpen} title="Изменить пароль" onClose={closePassword}>
        <form className={styles.modalForm} onSubmit={submitPassword} noValidate>
          <PasswordField label="Текущий пароль" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword', { required: 'Введите текущий пароль' })} />
          <PasswordField label="Новый пароль" autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword', { required: 'Введите новый пароль', minLength: { value: 8, message: 'Минимум 8 символов' } })} />
          <PasswordField label="Повторите новый пароль" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword', { validate: (value) => value === newPassword || 'Пароли не совпадают' })} />
          {errors.root?.message && <p className={styles.formError}>{errors.root.message}</p>}
          <div className={styles.formActions}><Button type="button" variant="ghost" onClick={closePassword}>Отмена</Button><Button type="submit" loading={isSubmitting}>Сохранить пароль</Button></div>
        </form>
      </Modal>
    </div>
  );
}
