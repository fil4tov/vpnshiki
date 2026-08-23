export type PaymentStatusFilter = 'all' | 'pending' | 'succeeded';

export interface TopUpFiltersValue {
  search: string;
  userId: string;
  status: PaymentStatusFilter;
}
