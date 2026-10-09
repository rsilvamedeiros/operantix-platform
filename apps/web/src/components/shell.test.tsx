import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Shell } from './shell';

const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

describe('Shell', () => {
  it('wraps the page in the app shell, with the console navigation', () => {
    pathname.current = '/';
    render(
      <Shell>
        <p>page</p>
      </Shell>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('page');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Design system' })).toHaveAttribute('href', '/design');
  });

  it('marks the section of the current route', () => {
    pathname.current = '/design';
    render(<Shell>x</Shell>);

    expect(screen.getByRole('link', { name: 'Design system' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });
});
