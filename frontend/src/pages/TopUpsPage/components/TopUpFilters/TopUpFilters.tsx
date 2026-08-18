import { FiSearch, FiX } from 'react-icons/fi';

import { FieldSelect } from '#shared/ui';

import type {
  PaymentStatusFilter,
  PaymentTypeFilter,
  TopUpFiltersValue,
} from '../../types';
import styles from './TopUpFilters.module.scss';

const statusOptions = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидает' },
  { value: 'succeeded', label: 'Зачислен' },
] as const;

const paymentTypeOptions = [
  { value: 'all', label: 'Все' },
  { value: 'AC', label: 'Карта' },
  { value: 'PC', label: 'Кошелёк' },
  { value: 'unknown', label: 'Не определён' },
] as const;

interface TopUpFiltersProps {
  value: TopUpFiltersValue;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: PaymentStatusFilter) => void;
  onPaymentTypeChange: (value: PaymentTypeFilter) => void;
  onReset: () => void;
}

export function TopUpFilters({
  value,
  onSearchChange,
  onStatusChange,
  onPaymentTypeChange,
  onReset,
}: TopUpFiltersProps) {
  const hasActiveFilters = Boolean(value.search)
    || value.status !== 'all'
    || value.paymentType !== 'all';

  return (
    <div className={styles.filters}>
      <label className={styles.search}>
        <FiSearch aria-hidden="true" />
        <span className={styles.srOnly}>Поиск платежей</span>
        <input
          value={value.search}
          placeholder="Пользователь, ID, label или операция"
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {value.search && (
          <button type="button" onClick={() => onSearchChange('')} aria-label="Очистить поиск">
            <FiX aria-hidden="true" />
          </button>
        )}
      </label>
      <div className={styles.filterRow}>
        <div className={styles.filterControl}>
          <FieldSelect
            className={styles.select}
            label="Статус"
            options={statusOptions}
            value={value.status}
            onChange={(nextValue) => onStatusChange(nextValue as PaymentStatusFilter)}
          />
          {value.status !== 'all' && (
            <button
              type="button"
              className={styles.clearFilter}
              onClick={() => onStatusChange('all')}
              aria-label="Очистить фильтр «Статус»"
            ><FiX aria-hidden="true" /></button>
          )}
        </div>
        <div className={styles.filterControl}>
          <FieldSelect
            className={styles.select}
            label="Способ"
            options={paymentTypeOptions}
            value={value.paymentType}
            onChange={(nextValue) => onPaymentTypeChange(nextValue as PaymentTypeFilter)}
          />
          {value.paymentType !== 'all' && (
            <button
              type="button"
              className={styles.clearFilter}
              onClick={() => onPaymentTypeChange('all')}
              aria-label="Очистить фильтр «Способ»"
            ><FiX aria-hidden="true" /></button>
          )}
        </div>
        <button
          type="button"
          className={styles.clearAll}
          disabled={!hasActiveFilters}
          onClick={onReset}
          aria-label="Очистить всё"
          title="Очистить все фильтры"
        ><FiX aria-hidden="true" /></button>
      </div>
    </div>
  );
}
