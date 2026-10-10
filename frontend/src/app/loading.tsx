import { PageLoader } from '@/src/components/ui/Spinner';

// Shown by Next.js while any top-level route is loading.
export default function Loading() {
  return <PageLoader minHeight="100vh" label="Loading…" />;
}
