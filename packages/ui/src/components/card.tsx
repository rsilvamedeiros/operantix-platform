import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  // A <section> is exposed as a region only when it has an accessible name (aria-labelledby).
  return (
    <section
      className={cn('rounded-card border border-border bg-surface text-foreground', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />;
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level, so the card fits the outline of the page. */
  level?: 2 | 3 | 4;
}

export function CardTitle({ level = 2, className, ...props }: CardTitleProps) {
  const Heading = `h${String(level)}` as 'h2' | 'h3' | 'h4';
  return <Heading className={cn('text-base font-semibold', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}
