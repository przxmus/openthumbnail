import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/lib/hooks/use-settings'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings } = useSettings()

  return (
    <main className="from-background via-background to-muted/25 min-h-screen bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
        <section className="flex items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
              OpenThumbnail Workshop
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              All settings are stored locally in your browser.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: '/' })}>
            Back to projects
          </Button>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>OpenRouter BYOK</CardTitle>
            <CardDescription>
              API key is stored locally in localStorage and never sent to any backend of this app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor="openrouter-key">OpenRouter API key</Label>
            <Input
              id="openrouter-key"
              type="password"
              placeholder="sk-or-v1-..."
              value={settings.openRouterApiKey}
              onChange={(event) => {
                updateSettings({ openRouterApiKey: event.target.value })
              }}
            />
            <p className="text-muted-foreground text-xs">
              Connected through TanStack AI with OpenRouter provider.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>UI Preferences</CardTitle>
            <CardDescription>
              Enable advanced technical metadata in timeline cards.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <input
              id="nerd-mode"
              type="checkbox"
              checked={settings.nerdMode}
              onChange={(event) => updateSettings({ nerdMode: event.target.checked })}
              className="accent-primary h-4 w-4 rounded"
            />
            <Label htmlFor="nerd-mode">Nerd mode (show provider metadata and trace)</Label>
          </CardContent>
          <CardFooter className="text-muted-foreground text-xs">
            Last used model: {settings.lastUsedModel ?? 'none'}
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
