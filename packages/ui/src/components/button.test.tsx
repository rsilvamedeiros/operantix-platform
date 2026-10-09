import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('is a plain button, so it never submits a surrounding form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('allows an explicit submit type', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('calls onClick when pressed with the mouse or the keyboard', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Run</Button>);

    await user.click(screen.getByRole('button', { name: 'Run' }));
    // The click left focus on the button, so the keyboard now presses it.
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not call onClick while disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Run
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('is disabled and announced as busy while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Run
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Run' });

    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('styles the variant with semantic tokens, not raw colors', () => {
    render(<Button variant="destructive">Delete</Button>);

    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger');
  });
});
