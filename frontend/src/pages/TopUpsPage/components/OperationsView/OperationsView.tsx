import { useMemo, useState } from 'react';
import { FiCheckCircle, FiChevronDown, FiClock, FiInbox } from 'react-icons/fi';

import type { AdminYooMoneyPayment } from '#entities/payment';
import { formatMoney } from '#shared/lib/money';
import {
  Badge,
  Button,
  DataTable,
  SummaryCard,
  SummaryCards,
  Surface,
  TableActionButton,
} from '#shared/ui';
import type { DataTableColumn } from '#shared/ui';

import { PaymentTechnicalDetails } from '../PaymentTechnicalDetails';
import { TopUpFilters } from '../TopUpFilters';
import type { PaymentStatusFilter, PaymentTypeFilter } from '../../types';
import {
  formatPaymentDate,
  formatPaymentTime,
  paymentStatusView,
  paymentTypeLabel,
  sumPayments,
} from '../../utils';
import styles from './OperationsView.module.scss';

const paymentCollator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });

function matchesPayment(
  payment: AdminYooMoneyPayment,
  search: string,
  status: PaymentStatusFilter,
  paymentType: PaymentTypeFilter,
): boolean {
  const query = search.trim().toLocaleLowerCase('ru-RU');
  const searchable = [
    payment.user_name,
    payment.id,
    payment.label,
    payment.operation_id ?? '',
  ].join(' ').toLocaleLowerCase('ru-RU');
  const matchesType = paymentType === 'all'
    || (paymentType === 'unknown' ? payment.payment_type === null : payment.payment_type === paymentType);
  return (!query || searchable.includes(query))
    && (status === 'all' || payment.status === status)
    && matchesType;
}

export function OperationsView({ payments }: { payments: AdminYooMoneyPayment[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaymentStatusFilter>('all');
  const [paymentType, setPaymentType] = useState<PaymentTypeFilter>('all');
  const filteredPayments = useMemo(
    () => payments.filter((payment) => matchesPayment(payment, search, status, paymentType)),
    [paymentType, payments, search, status],
  );
  const succeeded = payments.filter((payment) => payment.status === 'succeeded');
  const pendingCount = payments.length - succeeded.length;
  const resetFilters = () => {
    setSearch('');
    setStatus('all');
    setPaymentType('all');
  };
  const paymentColumns: DataTableColumn<AdminYooMoneyPayment>[] = [
    {
      id: 'created_at',
      label: 'Создан',
      compare: (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
      render: (payment) => (
        <time dateTime={payment.created_at}>
          <strong>{formatPaymentDate(payment.created_at)}</strong>
          <small>{formatPaymentTime(payment.created_at)} · МСК</small>
        </time>
      ),
    },
    {
      id: 'user_name',
      label: 'Пользователь',
      compare: (left, right) => paymentCollator.compare(left.user_name, right.user_name),
      render: (payment) => (
        <div className={styles.person}>
          <span>{payment.user_name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{payment.user_name}</strong><small>{payment.id.slice(0, 8)}</small></div>
        </div>
      ),
    },
    {
      id: 'status',
      label: 'Статус',
      compare: (left, right) => paymentCollator.compare(
        paymentStatusView[left.status].label,
        paymentStatusView[right.status].label,
      ),
      render: (payment) => {
        const statusView = paymentStatusView[payment.status];
        return <Badge tone={statusView.tone}>{statusView.label}</Badge>;
      },
    },
    {
      id: 'requested_amount',
      label: 'Запрошено',
      compare: (left, right) => Number(left.requested_amount) - Number(right.requested_amount),
      cellClassName: styles.money,
      render: (payment) => formatMoney(payment.requested_amount),
    },
    {
      id: 'received_amount',
      label: 'Зачислено',
      compare: (left, right) => Number(left.received_amount ?? -Infinity)
        - Number(right.received_amount ?? -Infinity),
      cellClassName: (payment) => `${styles.money} ${payment.received_amount ? styles.positive : ''}`,
      render: (payment) => payment.received_amount ? formatMoney(payment.received_amount) : '—',
    },
    {
      id: 'payment_type',
      label: 'Способ',
      compare: (left, right) => paymentCollator.compare(
        paymentTypeLabel(left.payment_type),
        paymentTypeLabel(right.payment_type),
      ),
      render: (payment) => <span className={styles.method}>{paymentTypeLabel(payment.payment_type)}</span>,
    },
    {
      id: 'details',
      label: 'Детали',
      headerVisuallyHidden: true,
      cellClassName: styles.action,
      render: (payment) => {
        const expanded = expandedId === payment.id;
        return (
          <TableActionButton
            aria-label={`${expanded ? 'Скрыть' : 'Показать'} детали платежа ${payment.id}`}
            aria-expanded={expanded}
            onClick={() => setExpandedId(expanded ? null : payment.id)}
          ><FiChevronDown className={expanded ? styles.rotated : ''} aria-hidden="true" /></TableActionButton>
        );
      },
    },
  ];

  return (
    <div className={styles.view}>
      <SummaryCards aria-label="Сводка пополнений">
        <SummaryCard label="Всего" value={payments.length} icon={<FiInbox />} />
        <SummaryCard label="Зачислено" value={succeeded.length} icon={<FiCheckCircle />} tone="positive" />
        <SummaryCard label="Ожидают" value={pendingCount} icon={<FiClock />} tone="warning" />
        <SummaryCard
          label="Получено"
          value={formatMoney(sumPayments(succeeded, 'received_amount'))}
          icon={<span className={styles.receivedMark} />}
          tone="positive"
        />
      </SummaryCards>

      <TopUpFilters
        value={{ search, status, paymentType }}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onPaymentTypeChange={setPaymentType}
        onReset={resetFilters}
      />

      <Surface className={styles.directory}>
        <div className={styles.tableHeading}>
          <h2>Журнал операций</h2>
        </div>
        {filteredPayments.length === 0 ? (
          <div className={styles.empty}>
            <div><strong>Ничего не найдено</strong><p>Измените запрос или сбросьте фильтры.</p></div>
            <Button variant="secondary" onClick={resetFilters}>Сбросить фильтры</Button>
          </div>
        ) : (
          <DataTable
            className={styles.tableWrap}
            rows={filteredPayments}
            columns={paymentColumns}
            getRowKey={(payment) => payment.id}
            initialSort={{ columnId: 'created_at', direction: 'descending' }}
            getRowClassName={(payment) => expandedId === payment.id ? styles.expandedRow : undefined}
            renderAfterRow={(payment, columnCount) => expandedId === payment.id ? (
              <tr className={styles.detailsRow}>
                <td colSpan={columnCount}><PaymentTechnicalDetails payment={payment} /></td>
              </tr>
            ) : null}
          />
        )}
      </Surface>
    </div>
  );
}
