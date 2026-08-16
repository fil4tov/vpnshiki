import { useQuery } from '@tanstack/react-query';

import { getMyDailyCharge, myDailyChargeKey, useUserStore } from '#entities/user';

import { ParticipationPulse, VpnAccessPanel } from './components';
import styles from './OverviewPage.module.scss';

export function OverviewPage() {
  const user = useUserStore((state) => state.user)!;
  const dailyChargeQuery = useQuery({ queryKey: myDailyChargeKey, queryFn: getMyDailyCharge });

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p>Личный кабинет</p>
        <h1>Привет, {user.name}</h1>
      </header>
      <ParticipationPulse
        accountStatus={user.account_status}
        balance={user.balance}
        negativeBalanceLimit={user.negative_balance_limit}
        dailyCharge={dailyChargeQuery.isPending ? undefined : dailyChargeQuery.data?.daily_charge ?? null}
      />
      <VpnAccessPanel accountStatus={user.account_status} />
    </div>
  );
}
