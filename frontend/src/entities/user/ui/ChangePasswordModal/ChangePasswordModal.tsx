import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { ApiError } from '#shared/api';
import { Button, GeneratePasswordButton, Modal, PasswordField } from '#shared/ui';

import { changeMyPassword } from '../../api';
import { useUserStore } from '../../userStore';
import styles from './ChangePasswordModal.module.scss';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangePasswordModal({ open, onClose, onSuccess }: ChangePasswordModalProps) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const { register, handleSubmit, reset, setError, setValue, getValues, formState: { errors, isSubmitting } } = useForm<PasswordForm>();

  const resetForm = () => {
    reset();
    setNewPasswordVisible(false);
    setConfirmPasswordVisible(false);
  };

  const cancel = () => {
    resetForm();
    window.requestAnimationFrame(onClose);
  };

  const closeAfterSuccess = () => {
    onClose();
    window.requestAnimationFrame(resetForm);
  };

  const applyGeneratedPassword = (password: string) => {
    setValue('newPassword', password, { shouldDirty: true, shouldValidate: true });
    setValue('confirmPassword', password, { shouldDirty: true, shouldValidate: true });
    setNewPasswordVisible(true);
    setConfirmPasswordVisible(true);
  };

  const submit = handleSubmit(async (values) => {
    try {
      setUser(await changeMyPassword(values.currentPassword, values.newPassword));
      closeAfterSuccess();
      onSuccess?.();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.current_password) {
        setError('currentPassword', { message: error.fieldErrors.current_password });
      } else {
        setError('root', { message: error instanceof ApiError ? error.message : 'Не удалось изменить пароль' });
      }
    }
  });

  return (
    <Modal open={open} title="Изменить пароль" onClose={cancel}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <input
          className={styles.usernameField}
          name="username"
          type="text"
          autoComplete="username"
          value={user?.name ?? ''}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
        <PasswordField label="Текущий пароль" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword', { required: 'Введите текущий пароль' })} />
        <PasswordField
          label="Новый пароль"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          visible={newPasswordVisible}
          onVisibilityChange={setNewPasswordVisible}
          endAdornment={<GeneratePasswordButton onGenerate={applyGeneratedPassword} />}
          {...register('newPassword', { required: 'Введите новый пароль', minLength: { value: 8, message: 'Минимум 8 символов' } })}
        />
        <PasswordField
          label="Повторите новый пароль"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          visible={confirmPasswordVisible}
          onVisibilityChange={setConfirmPasswordVisible}
          {...register('confirmPassword', { validate: (value) => value === getValues('newPassword') || 'Пароли не совпадают' })}
        />
        {errors.root?.message && <p className={styles.error}>{errors.root.message}</p>}
        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={cancel}>Отмена</Button>
          <Button type="submit" loading={isSubmitting}>Сохранить пароль</Button>
        </div>
      </form>
    </Modal>
  );
}
