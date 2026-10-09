'use client';

import { Button, PageHeader } from '@operantix/ui';

// The message is generic on purpose: the error and its stack never reach the browser.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <PageHeader
        title="Something went wrong"
        description="The page could not be shown. Try again."
      />
      <Button onClick={reset}>Try again</Button>
    </>
  );
}
