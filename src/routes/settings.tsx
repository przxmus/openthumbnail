import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { m } from '@/paraglide/messages.js'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { THEME_MODES } from '@/lib/constants/workshop'
import { useSettings } from '@/lib/hooks/use-settings'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function themeLabel(mode: 'light' | 'dark' | 'system') {
  if (mode === 'light') {
    return m.settings_theme_light()
  }

  if (mode === 'dark') {
    return m.settings_theme_dark()
  }

  return m.settings_theme_system()
}

function localeLabel(locale: 'en' | 'pl') {
  return locale === 'pl' ? m.settings_locale_pl() : m.settings_locale_en()
}

function SettingsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings } = useSettings()

  return (
    <main className="from-background via-background to-muted/25 min-h-screen bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 md:px-8">
        {/* Header */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              {m.app_name()}
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              {m.settings_title()}
            </h1>
            <p className="text-muted-foreground text-sm">
              {m.settings_description()}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: '/' })}>
            {m.settings_back_to_projects()}
          </Button>
        </section>

        <Separator />

        {/* API Key */}
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_openrouter_title()}</CardTitle>
            <CardDescription>
              {m.settings_openrouter_description()}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor="openrouter-key">
              {m.settings_openrouter_label()}
            </Label>
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
              {m.settings_openrouter_hint()}
            </p>
          </CardContent>
        </Card>

        {/* UI Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>{m.settings_ui_title()}</CardTitle>
            <CardDescription>{m.settings_ui_description()}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {/* Theme */}
            <div className="grid gap-2">
              <Label>{m.settings_theme_label()}</Label>
              <Select
                value={settings.themeMode}
                onValueChange={(value) => {
                  if (value) {
                    updateSettings({
                      themeMode: value as 'light' | 'dark' | 'system',
                    })
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEME_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {themeLabel(mode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="grid gap-2">
              <Label>{m.settings_locale_label()}</Label>
              <Select
                value={settings.locale}
                onValueChange={(value) => {
                  if (value) {
                    updateSettings({ locale: value as 'en' | 'pl' })
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{localeLabel('en')}</SelectItem>
                  <SelectItem value="pl">{localeLabel('pl')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Nerd mode */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>{m.settings_nerd_mode()}</Label>
                <p className="text-muted-foreground text-xs">
                  Show debug info for generations
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.nerdMode}
                onClick={() => updateSettings({ nerdMode: !settings.nerdMode })}
                className={`focus-visible:ring-ring relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${settings.nerdMode ? 'bg-primary' : 'bg-input'}`}
              >
                <span
                  className={`bg-background pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform ${settings.nerdMode ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </CardContent>
          <CardFooter className="text-muted-foreground text-xs">
            {m.settings_last_model({
              model: settings.lastUsedModel ?? m.common_none(),
            })}
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
