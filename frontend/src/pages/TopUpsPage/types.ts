export type PaymentStatusFilter = 'all' | 'pending' | 'succeeded';
export type PaymentTypeFilter = 'all' | 'AC' | 'PC' | 'unknown';

export interface TopUpFiltersValue {
  search: string;
  status: PaymentStatusFilter;
  paymentType: PaymentTypeFilter;
}
