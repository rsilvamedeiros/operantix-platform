import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell, type NavItem } from './app-shell';

const nav: NavItem[] = [
  { label: 'Overview', href: '/' },
  { label: 'Workflows', href: '/workflows' },
  { label: 'Executions', href: '/executions' },
];

function renderShell(currentPath = '/') {
  return render(
    <AppShell brand="Operantix" nav={nav} currentPath={currentPath}>
      <p>page content</p>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('has the landmarks a screen reader navigates by', () => {
    renderShell();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('page content');
  });

  it('offers a skip link as the first focusable element, pointing at the main content', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('lists every navigation item as a link', () => {
    renderShell();
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Workflows', 'Executions']);
  });

  it('marks only the current page with aria-current', () => {
    renderShell('/workflows');

    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('treats a nested path as inside its section, but "/" only as itself', () => {
    renderShell('/workflows/abc');

    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('opens and closes the small-screen menu with a button that reports its state', async () => {
    const user = userEvent.setup();
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Menu' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu with Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Menu' });

    await user.click(toggle);
    await user.keyboard('{Escape}');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('renders navigation links with a custom link component', () => {
    render(
      <AppShell
        brand="Operantix"
        nav={nav}
        currentPath="/"
        linkComponent={({ children, ...props }) => (
          <a data-router-link {...props}>
            {children}
          </a>
        )}
      >
        x
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute('data-router-link');
  });
});
