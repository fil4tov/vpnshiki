import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import type { AccountStatus, AdminUserPayload, AdminUserUpdatePayload, User } from '#entities/user';
import { ApiError } from '#shared/api';
import { Button, FieldSelect, GeneratePasswordButton, PasswordField, TextField } from '#shared/ui';
import type { FieldSelectOption } from '#shared/ui';

import styles from './UserForm.module.scss';

interface FormValues {
  name: string;
  password: string;
  balance: string;
  negativeBalanceLimit: string;
  role: 'admin' | 'user';
  accountStatus: AccountStatus;
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
  negativeBalanceLimit: user?.negative_balance_limit ?? '300.00',
  role: user?.role ?? 'user',
  accountStatus: user?.account_status ?? 'active',
});

const statusDescriptions: Record<AccountStatus, string> = {
  active: 'Участвует в общем расчёте',
  paused: 'Участие и ежедневные списания приостановлены',
  blocked: 'Не участвует и не может самостоятельно изменить статус',
};

const roleOptions = [
  { value: 'user', label: 'Участник' },
  { value: 'admin', label: 'Администратор' },
] satisfies FieldSelectOption[];

const statusOptions = [
  { value: 'active', label: 'Активен' },
  { value: 'paused', label: 'Приостановлен' },
  { value: 'blocked', label: 'Заблокирован' },
] satisfies FieldSelectOption[];

export function UserForm({ user, onCancel, onSubmit }: UserFormProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { register, handleSubmit, reset, setError, setValue, control, formState: { errors, isSubmitting } } = useForm<FormValues>({ defaultValues: defaults(user) });
  useEffect(() => reset(defaults(user)), [reset, user]);
  const accountStatus = useWatch({ control, name: 'accountStatus' });

  const applyGeneratedPassword = (password: string) => {
    setValue('password', password, { shouldDirty: true, shouldValidate: true });
    setPasswordVisible(true);
  };

  const submit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      balance: values.balance,
      negative_balance_limit: values.negativeBalanceLimit,
      role: values.role,
      account_status: values.accountStatus,
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
      <TextField label="Имя" placeholder="username" error={errors.name?.message} {...register('name', { required: 'Введите имя', minLength: { value: 2, message: 'Минимум 2 символа' } })} />
      {!user && (
        <PasswordField
          label="Начальный пароль"
          autoComplete="new-password"
          error={errors.password?.message}
          visible={passwordVisible}
          onVisibilityChange={setPasswordVisible}
          endAdornment={<GeneratePasswordButton onGenerate={applyGeneratedPassword} />}
          {...register('password', { required: 'Введите пароль', minLength: { value: 8, message: 'Минимум 8 символов' } })}
        />
      )}
      <div className={styles.moneyRow}>
        <TextField label="Баланс, ₽" type="number" step="0.01" error={errors.balance?.message} {...register('balance', { required: 'Введите баланс' })} />
        <TextField label="Допустимый минус, ₽" type="number" min="0" step="0.01" error={errors.negativeBalanceLimit?.message} {...register('negativeBalanceLimit', { required: 'Введите лимит', min: { value: 0, message: 'Лимит не может быть отрицательным' } })} />
      </div>
      <div className={styles.selectRow}>
        <Controller
          control={control}
          name="accountStatus"
          render={({ field }) => (
            <FieldSelect
              ref={field.ref}
              name={field.name}
              label="Статус аккаунта"
              options={statusOptions}
              value={field.value}
              hint={statusDescriptions[accountStatus]}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <FieldSelect
              ref={field.ref}
              name={field.name}
              label="Роль"
              options={roleOptions}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>
      {errors.root?.message && <p className={styles.formError}>{errors.root.message}</p>}
      <div className={styles.actions}><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button><Button type="submit" loading={isSubmitting}>{user ? 'Сохранить изменения' : 'Создать пользователя'}</Button></div>
    </form>
  );
}
