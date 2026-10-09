import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the page title as the h1', () => {
    render(<PageHeader title="Workflows" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Workflows' })).toBeInTheDocument();
  });

  it('renders the description and the actions when given', () => {
    render(
      <PageHeader title="Workflows" description="Automations of this workspace">
        <button type="button">New workflow</button>
      </PageHeader>,
    );

    expect(screen.getByText('Automations of this workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeInTheDocument();
  });
});
