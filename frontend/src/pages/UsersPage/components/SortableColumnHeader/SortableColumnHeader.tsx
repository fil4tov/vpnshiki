import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

import styles from './SortableColumnHeader.module.scss';

export type SortDirection = 'ascending' | 'descending' | 'none';

export function SortableColumnHeader({
  label,
  direction,
  onSort,
}: {
  label: string;
  direction: SortDirection;
  onSort: () => void;
}) {
  const actionTitle = direction === 'ascending'
    ? `Сбросить сортировку «${label}»`
    : `Сортировать «${label}» по ${direction === 'descending' ? 'возрастанию' : 'убыванию'}`;

  return (
    <th className={styles.header} aria-sort={direction}>
      <button
        type="button"
        title={actionTitle}
        onClick={onSort}
      >
        <span>{label}</span>
        <span className={`${styles.icon} ${direction === 'none' ? styles.idle : ''}`} aria-hidden="true">
          {direction !== 'descending' && <FiChevronUp />}
          {direction !== 'ascending' && <FiChevronDown />}
        </span>
      </button>
    </th>
  );
}
