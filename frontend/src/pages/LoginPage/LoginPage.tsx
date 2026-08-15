import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiArrowRight } from 'react-icons/fi';
import { Navigate } from 'react-router-dom';

import { useUserStore } from '#entities/user';
import { ApiError } from '#shared/api';
import { Button, PasswordField, Surface, TextField } from '#shared/ui';

import styles from './LoginPage.module.scss';

interface LoginForm {
  name: string;
  password: string;
}

export function LoginPage() {
  const status = useUserStore((state) => state.status);
  const login = useUserStore((state) => state.login);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    defaultValues: { name: '', password: '' },
  });

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await login(values);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не удалось войти');
    }
  });

  return (
    <main className={styles.page}>
      <section className={styles.auth}>
        <div className={styles.brand}><span>V</span><strong>VPNщики</strong></div>
        <Surface elevated className={styles.loginCard}>
          <h1 className={styles.title}>Вход</h1>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <TextField
              label="Имя"
              autoComplete="username"
              placeholder="Ваше имя"
              error={errors.name?.message}
              {...register('name', { required: 'Введите имя', minLength: { value: 2, message: 'Минимум 2 символа' } })}
            />
            <PasswordField
              label="Пароль"
              placeholder="Не менее 8 символов"
              error={errors.password?.message}
              {...register('password', { required: 'Введите пароль' })}
            />
            {formError && <p className={styles.formError} role="alert">{formError}</p>}
            <Button type="submit" fullWidth loading={isSubmitting}>Войти <FiArrowRight /></Button>
          </form>
        </Surface>
      </section>
    </main>
  );
}
