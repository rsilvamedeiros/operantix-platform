import { Badge, Card, CardContent, CardHeader, CardTitle } from '@operantix/ui';
import type { PlatformStatus } from '../lib/platform-status';

const OVERALL = {
  up: { label: 'Operational', tone: 'success' },
  degraded: { label: 'Degraded', tone: 'warning' },
  unreachable: { label: 'Unreachable', tone: 'danger' },
} as const;

export function PlatformStatusCard({ status }: { status: PlatformStatus }) {
  const overall = OVERALL[status.state];
  return (
    <Card aria-labelledby="platform-api-title">
      <CardHeader>
        <CardTitle id="platform-api-title">Platform API</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Badge tone={overall.tone}>{overall.label}</Badge>
        </div>
        {status.state !== 'unreachable' && (
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(status.checks).map(([name, state]) => (
              <li key={name} className="flex items-center justify-between gap-4">
                <span>{name}</span>
                <Badge tone={state === 'up' ? 'success' : 'danger'}>
                  {state === 'up' ? 'Up' : 'Down'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
