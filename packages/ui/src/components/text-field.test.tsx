import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TextField } from './text-field';

describe('TextField', () => {
  it('associates the label with the input', () => {
    render(<TextField label="Workspace name" />);

    expect(screen.getByLabelText('Workspace name')).toBeInstanceOf(HTMLInputElement);
  });

  it('describes the input with its hint', () => {
    render(<TextField label="Slug" hint="Lowercase letters and dashes" />);

    expect(screen.getByLabelText('Slug')).toHaveAccessibleDescription(
      'Lowercase letters and dashes',
    );
  });

  it('marks the input invalid and announces the error', () => {
    render(<TextField label="Slug" hint="Lowercase" error="Already taken" />);
    const input = screen.getByLabelText('Slug');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Lowercase Already taken');
    expect(screen.getByRole('alert')).toHaveTextContent('Already taken');
  });

  it('is not invalid without an error', () => {
    render(<TextField label="Slug" />);

    expect(screen.getByLabelText('Slug')).not.toHaveAttribute('aria-invalid');
  });

  it('passes typed text through', async () => {
    const user = userEvent.setup();
    render(<TextField label="Name" />);

    await user.type(screen.getByLabelText('Name'), 'Ops');

    expect(screen.getByLabelText('Name')).toHaveValue('Ops');
  });

  it('gives two fields distinct ids', () => {
    render(
      <>
        <TextField label="A" />
        <TextField label="B" />
      </>,
    );

    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});
