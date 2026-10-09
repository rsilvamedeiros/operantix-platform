import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('shows its text, so the state is never conveyed by color alone', () => {
    render(<Badge tone="danger">Failed</Badge>);

    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('defaults to the neutral tone', () => {
    render(<Badge>Draft</Badge>);

    expect(screen.getByText('Draft').className).toContain('bg-muted');
  });

  it.each([
    ['success', 'bg-success-soft'],
    ['warning', 'bg-warning-soft'],
    ['danger', 'bg-danger-soft'],
    ['info', 'bg-info-soft'],
  ] as const)('maps the %s tone to %s', (tone, expected) => {
    render(<Badge tone={tone}>x</Badge>);

    expect(screen.getByText('x').className).toContain(expected);
  });
});
