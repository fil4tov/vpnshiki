import { Fragment, useMemo, useState } from 'react';
import type { Key, ReactNode } from 'react';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

import styles from './DataTable.module.scss';

export type DataTableSortDirection = 'ascending' | 'descending';

export interface DataTableSort {
  columnId: string;
  direction: DataTableSortDirection;
}

export interface DataTableColumn<Row> {
  id: string;
  label: string;
  render: (row: Row) => ReactNode;
  compare?: (left: Row, right: Row) => number;
  headerClassName?: string;
  cellClassName?: string | ((row: Row) => string | undefined);
  headerVisuallyHidden?: boolean;
}

interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getRowKey: (row: Row) => Key;
  initialSort?: DataTableSort | null;
  className?: string;
  tableClassName?: string;
  getRowClassName?: (row: Row) => string | undefined;
  renderAfterRow?: (row: Row, columnCount: number) => ReactNode;
}

function SortableColumnHeader({
  label,
  direction,
  onSort,
  className = '',
}: {
  label: string;
  direction: DataTableSortDirection | 'none';
  onSort: () => void;
  className?: string;
}) {
  const actionTitle = direction === 'ascending'
    ? `Сбросить сортировку «${label}»`
    : `Сортировать «${label}» по ${direction === 'descending' ? 'возрастанию' : 'убыванию'}`;

  return (
    <th className={`${styles.sortableHeader} ${className}`} aria-sort={direction}>
      <button type="button" title={actionTitle} onClick={onSort}>
        <span>{label}</span>
        <span
          className={`${styles.sortIcon} ${direction === 'none' ? styles.idleSortIcon : ''}`}
          aria-hidden="true"
        >
          {direction !== 'descending' && <FiChevronUp />}
          {direction !== 'ascending' && <FiChevronDown />}
        </span>
      </button>
    </th>
  );
}

export function DataTable<Row>({
  rows,
  columns,
  getRowKey,
  initialSort = null,
  className = '',
  tableClassName = '',
  getRowClassName,
  renderAfterRow,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<DataTableSort | null>(initialSort);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.id === sort.columnId);
    if (!column?.compare) return rows;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((left, right) => column.compare!(left, right) * direction);
  }, [columns, rows, sort]);

  const toggleSort = (columnId: string) => {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: 'descending' };
      if (current.direction === 'descending') return { columnId, direction: 'ascending' };
      return null;
    });
  };

  return (
    <div className={className}>
      <table className={tableClassName}>
        <thead>
          <tr>
            {columns.map((column) => column.compare ? (
              <SortableColumnHeader
                key={column.id}
                label={column.label}
                direction={sort?.columnId === column.id ? sort.direction : 'none'}
                onSort={() => toggleSort(column.id)}
                className={column.headerClassName}
              />
            ) : (
              <th key={column.id} className={column.headerClassName}>
                <span className={column.headerVisuallyHidden ? styles.srOnly : undefined}>
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <Fragment key={getRowKey(row)}>
              <tr className={getRowClassName?.(row)}>
                {columns.map((column) => {
                  const className = typeof column.cellClassName === 'function'
                    ? column.cellClassName(row)
                    : column.cellClassName;
                  return (
                    <td key={column.id} data-label={column.label} className={className}>
                      {column.render(row)}
                    </td>
                  );
                })}
              </tr>
              {renderAfterRow?.(row, columns.length)}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
