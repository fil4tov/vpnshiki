export type YooMoneyPaymentStatus = 'pending' | 'succeeded';

export interface YooMoneyCheckout {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

export interface YooMoneyPayment {
  id: string;
  status: YooMoneyPaymentStatus;
  requested_amount: string;
  received_amount: string | null;
  created_at: string;
  paid_at: string | null;
  checkout: YooMoneyCheckout | null;
}

export interface CreateYooMoneyPaymentPayload {
  amount: string;
}

export type YooMoneyPaymentType = 'PC' | 'AC';

export interface AdminYooMoneyPayment {
  id: string;
  user_id: string;
  user_name: string;
  label: string;
  requested_amount: string;
  withdrawn_amount: string | null;
  received_amount: string | null;
  payment_type: YooMoneyPaymentType | null;
  operation_id: string | null;
  status: YooMoneyPaymentStatus;
  last_reconciliation_check_at: string | null;
  created_at: string;
  paid_at: string | null;
}
