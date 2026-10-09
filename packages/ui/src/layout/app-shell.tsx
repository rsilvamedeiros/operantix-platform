'use client';

import {
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';

export interface NavItem {
  label: string;
  href: string;
}

export type LinkComponent = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>;

export interface AppShellProps {
  brand: string;
  nav: readonly NavItem[];
  /** Pathname of the page being shown; marks the matching item as the current page. */
  currentPath: string;
  /** Router-aware link (e.g. next/link); a plain anchor by default. */
  linkComponent?: LinkComponent;
  children: ReactNode;
}

const PlainLink: LinkComponent = (props) => <a {...props} />;

function isCurrent(href: string, currentPath: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Page frame: skip link, header with the brand, a navigation that collapses on small screens, and the main area. */
export function AppShell({
  brand,
  nav,
  currentPath,
  linkComponent: Link = PlainLink,
  children,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[16rem_1fr]"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="border-b border-border md:border-r md:border-b-0">
        <header className="flex h-14 items-center justify-between px-4">
          <span className="text-lg font-semibold">{brand}</span>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => {
              setOpen((value) => !value);
            }}
            className="rounded-control px-3 py-1.5 text-sm hover:bg-muted md:hidden"
          >
            Menu
          </button>
        </header>
        <nav
          id="main-nav"
          aria-label="Main"
          className={cn('flex-col gap-1 p-3 md:flex', open ? 'flex' : 'hidden')}
        >
          {nav.map((item) => {
            const current = isCurrent(item.href, currentPath);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'rounded-control px-3 py-2 text-sm font-medium',
                  current
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <main id="main-content" className="min-w-0 p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
