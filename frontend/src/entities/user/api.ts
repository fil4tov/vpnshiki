import { apiRequest } from '#shared/api';

import type { AdminUserPayload, AdminUserUpdatePayload, LoginPayload, User } from './types';

export const getCurrentUser = () => apiRequest<User>('auth/me');
export const login = (payload: LoginPayload) => apiRequest<User>('auth/login', { method: 'post', json: payload });
export const logout = () => apiRequest<void>('auth/logout', { method: 'post' });
export const updateMyActivity = (isActive: boolean) => apiRequest<User>('users/me/activity', {
  method: 'patch',
  json: { is_active: isActive },
});
export const changeMyPassword = (currentPassword: string, newPassword: string) => apiRequest<User>(
  'users/me/password',
  { method: 'post', json: { current_password: currentPassword, new_password: newPassword } },
);
export const getUsers = () => apiRequest<User[]>('admin/users');
export const createUser = (payload: AdminUserPayload) => apiRequest<User>('admin/users', {
  method: 'post', json: payload,
});
export const updateUser = (id: string, payload: AdminUserUpdatePayload) => apiRequest<User>(
  `admin/users/${id}`,
  { method: 'patch', json: payload },
);
export const resetUserPassword = (id: string, newPassword: string) => apiRequest<void>(
  `admin/users/${id}/password`,
  { method: 'post', json: { new_password: newPassword } },
);

