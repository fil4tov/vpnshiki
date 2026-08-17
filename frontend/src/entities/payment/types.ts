export type YooMoneyPaymentType = 'PC' | 'AC';
export type YooMoneyPaymentStatus = 'pending' | 'succeeded' | 'review_required';

export interface YooMoneyCheckout {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

export interface YooMoneyPayment {
  id: string;
  status: YooMoneyPaymentStatus;
  payment_type: YooMoneyPaymentType;
  credit_amount: string;
  payable_amount: string;
  received_amount: string | null;
  review_reason: string | null;
  created_at: string;
  paid_at: string | null;
  checkout: YooMoneyCheckout | null;
}

export interface CreateYooMoneyPaymentPayload {
  amount: string;
  payment_type: YooMoneyPaymentType;
}
