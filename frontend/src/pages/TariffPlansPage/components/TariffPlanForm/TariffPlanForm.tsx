import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FiClock } from 'react-icons/fi';

import {
  addCalendarDays,
  formatCalendarDate,
  formatTariffPlanName,
  getMoscowDate,
  getPreviewEndDate,
} from '#entities/tariffPlan';
import type { TariffPlan, TariffPlanPayload } from '#entities/tariffPlan';
import { ApiError } from '#shared/api';
import { Button, TextField } from '#shared/ui';

import styles from './TariffPlanForm.module.scss';

interface FormValues {
  monthlyAmount: string;
  startDate: string;
}

interface TariffPlanFormProps {
  plan?: TariffPlan;
  plans: TariffPlan[];
  onCancel: () => void;
  onSubmit: (payload: TariffPlanPayload) => Promise<void>;
}

const defaults = (plan?: TariffPlan): FormValues => ({
  monthlyAmount: plan?.monthly_amount ?? '',
  startDate: plan?.start_date ?? '',
});

export function TariffPlanForm({ plan, plans, onCancel, onSubmit }: TariffPlanFormProps) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<FormValues>({ defaultValues: defaults(plan) });
  useEffect(() => reset(defaults(plan)), [plan, reset]);

  const startDate = useWatch({ control, name: 'startDate' });
  const minimumStart = plans.length > 0 ? addCalendarDays(getMoscowDate(), 1) : undefined;
  const endDate = getPreviewEndDate(startDate, plans, plan?.id);

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        monthly_amount: values.monthlyAmount,
        start_date: values.startDate,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        Object.entries(error.fieldErrors ?? {}).forEach(([field, message]) => {
          const mapped = field === 'monthly_amount' ? 'monthlyAmount' : 'startDate';
          setError(mapped, { message });
        });
        if (!error.fieldErrors) setError('root', { message: error.message });
      } else {
        setError('root', { message: 'Не удалось сохранить тарифный план' });
      }
    }
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField label="Название" value={formatTariffPlanName(startDate)} disabled />
      <div className={styles.fieldsRow}>
        <TextField
          label="Сумма за месяц, ₽"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Например, 12500.00"
          error={errors.monthlyAmount?.message}
          {...register('monthlyAmount', {
            required: 'Введите сумму',
            min: { value: 0.01, message: 'Сумма должна быть больше нуля' },
          })}
        />
        <TextField
          label="Дата начала"
          type="date"
          min={minimumStart}
          error={errors.startDate?.message}
          {...register('startDate', {
            required: 'Выберите дату начала',
            validate: (value) => !minimumStart || value >= minimumStart
              || 'Выберите будущую дату по Москве',
          })}
        />
      </div>
      <TextField
        label="Дата окончания"
        value={formatCalendarDate(endDate)}
        hint="Определяется датой начала следующего плана"
        disabled
      />
      <div className={styles.timezoneNote}>
        <FiClock aria-hidden="true" />
        <span>Периоды начинаются в 00:00 и заканчиваются в 23:59 по московскому времени.</span>
      </div>
      {errors.root?.message && <p className={styles.formError} role="alert">{errors.root.message}</p>}
      <div className={styles.actions} data-modal-footer>
        <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button type="submit" loading={isSubmitting}>
          {plan ? 'Сохранить изменения' : 'Создать план'}
        </Button>
      </div>
    </form>
  );
}
