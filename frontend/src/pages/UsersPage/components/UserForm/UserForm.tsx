import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { AdminUserPayload, AdminUserUpdatePayload, User } from '#entities/user';
import { ApiError } from '#shared/api';
import { Button, PasswordField, Switch, TextField } from '#shared/ui';

import styles from './UserForm.module.scss';

interface FormValues {
  name: string;
  password: string;
  balance: string;
  negativeBalanceLimit: string;
  role: 'admin' | 'user';
  isActive: boolean;
  isBlocked: boolean;
}

interface UserFormProps {
  user?: User;
  onCancel: () => void;
  onSubmit: (payload: AdminUserPayload | AdminUserUpdatePayload) => Promise<void>;
}

const defaults = (user?: User): FormValues => ({
  name: user?.name ?? '',
  password: '',
  balance: user?.balance ?? '0.00',
  negativeBalanceLimit: user?.negative_balance_limit ?? '0.00',
  role: user?.role ?? 'user',
  isActive: user?.is_active ?? true,
  isBlocked: user?.is_blocked ?? false,
});

export function UserForm({ user, onCancel, onSubmit }: UserFormProps) {
  const { register, handleSubmit, reset, setError, setValue, control, formState: { errors, isSubmitting } } = useForm<FormValues>({ defaultValues: defaults(user) });
  useEffect(() => reset(defaults(user)), [reset, user]);
  const active = useWatch({ control, name: 'isActive' });
  const blocked = useWatch({ control, name: 'isBlocked' });

  const submit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      balance: values.balance,
      negative_balance_limit: values.negativeBalanceLimit,
      role: values.role,
      is_active: values.isActive,
      is_blocked: values.isBlocked,
      ...(!user ? { password: values.password } : {}),
    } as AdminUserPayload | AdminUserUpdatePayload;
    try {
      await onSubmit(payload);
    } catch (error) {
      if (error instanceof ApiError) {
        Object.entries(error.fieldErrors ?? {}).forEach(([field, message]) => {
          const mapped = field === 'negative_balance_limit' ? 'negativeBalanceLimit' : field;
          setError(mapped as keyof FormValues, { message });
        });
        if (!error.fieldErrors) setError('root', { message: error.message });
      } else {
        setError('root', { message: 'Не удалось сохранить пользователя' });
      }
    }
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField label="Имя" placeholder="Например, Антон" error={errors.name?.message} {...register('name', { required: 'Введите имя', minLength: { value: 2, message: 'Минимум 2 символа' } })} />
      {!user && <PasswordField label="Начальный пароль" autoComplete="new-password" error={errors.password?.message} {...register('password', { required: 'Введите пароль', minLength: { value: 8, message: 'Минимум 8 символов' } })} />}
      <div className={styles.moneyRow}>
        <TextField label="Баланс, ₽" type="number" step="0.01" error={errors.balance?.message} {...register('balance', { required: 'Введите баланс' })} />
        <TextField label="Допустимый минус, ₽" type="number" min="0" step="0.01" error={errors.negativeBalanceLimit?.message} {...register('negativeBalanceLimit', { required: 'Введите лимит', min: { value: 0, message: 'Лимит не может быть отрицательным' } })} />
      </div>
      <label className={styles.selectField}>
        <span>Роль</span>
        <select {...register('role')}><option value="user">Участник</option><option value="admin">Администратор</option></select>
      </label>
      <div className={styles.toggles}>
        <div><div><strong>Участвует</strong><span>Аккаунт входит в общий расчёт</span></div><Switch checked={active} label="Участие пользователя" onClick={() => setValue('isActive', !active, { shouldDirty: true })} /></div>
        <div><div><strong>Заблокирован</strong><span>Пользователь не может менять статус</span></div><Switch checked={blocked} label="Блокировка пользователя" onClick={() => setValue('isBlocked', !blocked, { shouldDirty: true })} /></div>
      </div>
      {errors.root?.message && <p className={styles.formError}>{errors.root.message}</p>}
      <div className={styles.actions}><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button><Button type="submit" loading={isSubmitting}>{user ? 'Сохранить изменения' : 'Создать пользователя'}</Button></div>
    </form>
  );
}
