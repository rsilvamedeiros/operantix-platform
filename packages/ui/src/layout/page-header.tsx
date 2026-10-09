import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Page-level actions, aligned to the end. */
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description !== undefined && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children !== undefined && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
