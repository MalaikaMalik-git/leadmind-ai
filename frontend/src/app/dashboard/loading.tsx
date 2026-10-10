import { PageLoader } from '@/src/components/ui/Spinner';

// Shown inside the dashboard shell (sidebar + topbar stay visible)
// while the next dashboard page is loading.
export default function DashboardLoading() {
  return <PageLoader minHeight="calc(100vh - 64px)" label="Loading…" />;
}
