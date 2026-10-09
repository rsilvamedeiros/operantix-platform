import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  TextField,
} from '@operantix/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Design system' };

const TONES = ['neutral', 'success', 'warning', 'danger', 'info'] as const;
const VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const;

export default function DesignPage() {
  return (
    <>
      <PageHeader
        title="Design system"
        description="The tokens and components every screen is built from. Follows the system light or dark theme."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card aria-labelledby="buttons-title">
          <CardHeader>
            <CardTitle id="buttons-title">Buttons</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
            <Button loading>loading</Button>
            <Button disabled>disabled</Button>
          </CardContent>
        </Card>
        <Card aria-labelledby="badges-title">
          <CardHeader>
            <CardTitle id="badges-title">Badges</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card aria-labelledby="fields-title">
          <CardHeader>
            <CardTitle id="fields-title">Text fields</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField label="Workspace name" hint="Shown to everyone in the organization." />
            <TextField
              label="Slug"
              defaultValue="Ops Team"
              error="Use lowercase letters and dashes."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
