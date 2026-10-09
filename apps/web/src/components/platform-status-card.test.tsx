import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlatformStatusCard } from './platform-status-card';

describe('PlatformStatusCard', () => {
  it('is a named region with the overall state as text', () => {
    render(<PlatformStatusCard status={{ state: 'up', checks: { postgres: 'up' } }} />);

    expect(screen.getByRole('region', { name: 'Platform API' })).toHaveTextContent('Operational');
  });

  it('lists each dependency with its state as text', () => {
    render(
      <PlatformStatusCard
        status={{ state: 'degraded', checks: { postgres: 'up', redis: 'down' } }}
      />,
    );

    expect(screen.getByText('Degraded')).toBeInTheDocument();
    const [postgres, redis] = screen.getAllByRole('listitem');
    expect(postgres).toHaveTextContent(/postgres\s*Up/);
    expect(redis).toHaveTextContent(/redis\s*Down/);
  });

  it('says so, without detail, when the API cannot be reached', () => {
    render(<PlatformStatusCard status={{ state: 'unreachable' }} />);

    expect(screen.getByText('Unreachable')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
