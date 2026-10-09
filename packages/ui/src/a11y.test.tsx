import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, TextField } from './index';
import { AppShell } from './layout/app-shell';
import { PageHeader } from './layout/page-header';

// jsdom does not compute colors, so contrast is covered by tokens.test.ts; this checks structure,
// names, roles and ARIA usage.
async function violations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('accessibility', () => {
  it('has no structural violations in a full page of components', async () => {
    const { container } = render(
      <AppShell
        brand="Operantix"
        nav={[
          { label: 'Overview', href: '/' },
          { label: 'Workflows', href: '/workflows' },
        ]}
        currentPath="/workflows"
      >
        <PageHeader title="Workflows" description="Automations">
          <Button>New</Button>
        </PageHeader>
        <Card aria-labelledby="c">
          <CardHeader>
            <CardTitle id="c">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge tone="success">Up</Badge>
            <TextField label="Name" hint="Shown to everyone" />
            <TextField label="Slug" error="Already taken" />
            <Button loading>Saving</Button>
          </CardContent>
        </Card>
      </AppShell>,
    );

    expect(await violations(container)).toEqual([]);
  });
});
