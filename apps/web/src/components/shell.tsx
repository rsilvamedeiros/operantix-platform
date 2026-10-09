'use client';

import { AppShell, type LinkProps, type NavItem } from '@operantix/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV: readonly NavItem[] = [
  { label: 'Overview', href: '/' },
  { label: 'Design system', href: '/design' },
];

function RouterLink({ href, ...props }: LinkProps) {
  return <Link href={href} {...props} />;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell brand="Operantix" nav={NAV} currentPath={pathname} linkComponent={RouterLink}>
      {children}
    </AppShell>
  );
}
