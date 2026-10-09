import { PageHeader } from '@operantix/ui';
import { PlatformStatusCard } from '../components/platform-status-card';
import { apiBaseUrl } from '../lib/env';
import { fetchPlatformStatus } from '../lib/platform-status';

// Readiness is live data: render per request, never at build time.
export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const status = await fetchPlatformStatus({ baseUrl: apiBaseUrl(process.env) });
  return (
    <>
      <PageHeader title="Overview" description="Health of the platform behind this console." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PlatformStatusCard status={status} />
      </div>
    </>
  );
}
