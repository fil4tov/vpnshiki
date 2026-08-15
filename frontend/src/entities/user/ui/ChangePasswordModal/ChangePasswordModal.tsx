import { useForm, useWatch } from 'react-hook-form';

import { ApiError } from '#shared/api';
import { Button, Modal, PasswordField } from '#shared/ui';

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
  const setUser = useUserStore((state) => state.setUser);
  const { register, handleSubmit, reset, setError, control, formState: { errors, isSubmitting } } = useForm<PasswordForm>();
  const newPassword = useWatch({ control, name: 'newPassword' });

  const close = () => {
    reset();
    onClose();
  };

  const submit = handleSubmit(async (values) => {
    try {
      setUser(await changeMyPassword(values.currentPassword, values.newPassword));
      close();
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
    <Modal open={open} title="Изменить пароль" onClose={close}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <PasswordField label="Текущий пароль" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword', { required: 'Введите текущий пароль' })} />
        <PasswordField label="Новый пароль" autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword', { required: 'Введите новый пароль', minLength: { value: 8, message: 'Минимум 8 символов' } })} />
        <PasswordField label="Повторите новый пароль" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword', { validate: (value) => value === newPassword || 'Пароли не совпадают' })} />
        {errors.root?.message && <p className={styles.error}>{errors.root.message}</p>}
        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={close}>Отмена</Button>
          <Button type="submit" loading={isSubmitting}>Сохранить пароль</Button>
        </div>
      </form>
    </Modal>
  );
}
