import { useQuery } from '@tanstack/react-query';
import { FiArrowUpRight } from 'react-icons/fi';

import { getRecommendedVpnClients, recommendedVpnClientsKey } from './api';
import styles from './RecommendedVpnClients.module.scss';

export function RecommendedVpnClients() {
  const clientsQuery = useQuery({
    queryKey: recommendedVpnClientsKey,
    queryFn: getRecommendedVpnClients,
    staleTime: 0,
  });

  return (
    <section className={styles.section} aria-labelledby="vpn-clients-heading">
      <div className={styles.catalog}>
        <h2 id="vpn-clients-heading">Рекомендуемые VPN-клиенты</h2>

        {clientsQuery.isPending && (
          <div className={styles.loading} role="status" aria-label="Загрузка рекомендуемых VPN-клиентов">
            <span /><span /><span /><span />
          </div>
        )}

        {clientsQuery.isError && (
          <p className={styles.error} role="alert">Список временно недоступен</p>
        )}

        {clientsQuery.data && (
          <ul className={styles.clients}>
            {clientsQuery.data.map((client, index) => (
              <li key={`${client.name}-${client.url}`}>
                <a href={client.url} target="_blank" rel="noreferrer">
                  <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.clientName}>{client.name}</span>
                  <FiArrowUpRight className={styles.arrow} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

    </section>
  );
}
