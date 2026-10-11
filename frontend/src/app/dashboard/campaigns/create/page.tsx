'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Creating a campaign happens in a dialog on the campaigns list.
// This route stays so older links still land in the right place.
export default function CreateCampaignPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/campaigns?create=1');
  }, [router]);

  return null;
}
