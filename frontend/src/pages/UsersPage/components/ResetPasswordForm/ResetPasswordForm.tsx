import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { ApiError } from '#shared/api';
import { Button, GeneratePasswordButton, PasswordField } from '#shared/ui';

import styles from './ResetPasswordForm.module.scss';

interface Values { password: string; confirmation: string }

export function ResetPasswordForm({ name, onCancel, onSubmit }: { name: string; onCancel: () => void; onSubmit: (password: string) => Promise<void> }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const { register, handleSubmit, setError, setValue, getValues, formState: { errors, isSubmitting } } = useForm<Values>();
  const applyGeneratedPassword = (generatedPassword: string) => {
    setValue('password', generatedPassword, { shouldDirty: true, shouldValidate: true });
    setValue('confirmation', generatedPassword, { shouldDirty: true, shouldValidate: true });
    setPasswordVisible(true);
    setConfirmationVisible(true);
  };
  const submit = handleSubmit(async ({ password }) => {
    try { await onSubmit(password); }
    catch (error) { setError('root', { message: error instanceof ApiError ? error.message : 'Не удалось сменить пароль' }); }
  });
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p>Все активные сессии пользователя <strong>{name}</strong> будут завершены.</p>
      <PasswordField
        label="Новый пароль"
        autoComplete="new-password"
        error={errors.password?.message}
        visible={passwordVisible}
        onVisibilityChange={setPasswordVisible}
        endAdornment={<GeneratePasswordButton onGenerate={applyGeneratedPassword} />}
        {...register('password', { required: 'Введите пароль', minLength: { value: 8, message: 'Минимум 8 символов' } })}
      />
      <PasswordField
        label="Повторите пароль"
        autoComplete="new-password"
        error={errors.confirmation?.message}
        visible={confirmationVisible}
        onVisibilityChange={setConfirmationVisible}
        {...register('confirmation', { validate: (value) => value === getValues('password') || 'Пароли не совпадают' })}
      />
      {errors.root?.message && <p className={styles.error}>{errors.root.message}</p>}
      <div className={styles.actions} data-modal-footer><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button><Button type="submit" loading={isSubmitting}>Сбросить пароль</Button></div>
    </form>
  );
}
