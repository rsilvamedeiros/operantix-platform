import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '../components/shell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Operantix', template: '%s · Operantix' },
  description: 'Operational automation and AI platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
