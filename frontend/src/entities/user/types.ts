export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  balance: string;
  negative_balance_limit: string;
  role: UserRole;
  is_active: boolean;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginPayload {
  name: string;
  password: string;
}

export interface AdminUserPayload {
  name: string;
  password: string;
  balance: string;
  negative_balance_limit: string;
  role: UserRole;
  is_active: boolean;
  is_blocked: boolean;
}

export type AdminUserUpdatePayload = Omit<AdminUserPayload, 'password'>;

