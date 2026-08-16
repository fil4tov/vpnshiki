export interface VpnProfile {
  name: string;
  protocol: string;
  transport: string | null;
  security: string | null;
  url: string;
}

export interface VpnAccess {
  subscription_url: string;
  profiles: VpnProfile[];
}
