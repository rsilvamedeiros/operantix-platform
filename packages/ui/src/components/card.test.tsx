import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('is a labelled region when its title is referenced', () => {
    render(
      <Card aria-labelledby="t">
        <CardHeader>
          <CardTitle id="t">API</CardTitle>
        </CardHeader>
        <CardContent>ready</CardContent>
      </Card>,
    );

    expect(screen.getByRole('region', { name: 'API' })).toHaveTextContent('ready');
  });

  it('renders the title as an h2 by default and as the requested level otherwise', () => {
    render(
      <>
        <CardTitle>Default</CardTitle>
        <CardTitle level={3}>Nested</CardTitle>
      </>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Default' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Nested' })).toBeInTheDocument();
  });
});
