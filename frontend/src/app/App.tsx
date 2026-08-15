import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { Pages } from '#pages';

import { useTheme } from './providers/withTheme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
});

export function App() {
  const { theme, toggleTheme } = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><Pages theme={theme} toggleTheme={toggleTheme} /></BrowserRouter>
    </QueryClientProvider>
  );
}
