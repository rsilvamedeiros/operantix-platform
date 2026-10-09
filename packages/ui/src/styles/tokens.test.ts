import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing ${marker}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed ${marker}`);
}

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = declarations(blockAfter(':root {'));
const dark = declarations(blockAfter('@media (prefers-color-scheme: dark)'));
const darkOverride = declarations(blockAfter(":root[data-theme='dark']"));

// Text on its background must reach WCAG AA (4.5:1).
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary-foreground', 'primary-hover'],
  ['danger-foreground', 'danger'],
  ['success-soft-foreground', 'success-soft'],
  ['warning-soft-foreground', 'warning-soft'],
  ['danger-soft-foreground', 'danger-soft'],
  ['info-soft-foreground', 'info-soft'],
  ['primary', 'background'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme tokens', (_name, theme) => {
  it.each(TEXT_PAIRS)('%s on %s reaches WCAG AA contrast', (fg, bg) => {
    expect(theme[fg], `${fg} is defined`).toBeDefined();
    expect(theme[bg], `${bg} is defined`).toBeDefined();
    expect(contrast(theme[fg] as string, theme[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus ring visible against the background (3:1)', () => {
    expect(contrast(theme['ring'] as string, theme['background'] as string)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('keeps borders visible against the background (3:1)', () => {
    expect(
      contrast(theme['border-strong'] as string, theme['background'] as string),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('theme switching', () => {
  it('defines the same tokens in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('gives the explicit dark theme the same values as the system dark theme', () => {
    expect(darkOverride).toEqual(dark);
  });
});
