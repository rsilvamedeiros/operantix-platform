import { PageHeader } from '@operantix/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="This page does not exist." />
      <Link href="/" className="text-primary underline">
        Back to the overview
      </Link>
    </>
  );
}
