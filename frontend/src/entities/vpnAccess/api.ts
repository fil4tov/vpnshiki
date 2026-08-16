import { apiRequest } from '#shared/api';

import type { VpnAccess } from './types';

export const myVpnAccessKey = ['vpn-access', 'me'] as const;

export const getMyVpnAccess = () => apiRequest<VpnAccess>('users/me/vpn');
