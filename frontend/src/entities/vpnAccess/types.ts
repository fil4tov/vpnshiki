export interface VpnConnection {
  name: string;
  protocol: string;
  transport: string | null;
  security: string | null;
  url: string;
}

export interface VpnClientProfile {
  email: string;
  label: string;
  subscription_url: string;
  connections: VpnConnection[];
}

export interface VpnAccess {
  profiles: VpnClientProfile[];
}
