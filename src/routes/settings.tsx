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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
        <section className="flex items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
              {m.app_name()}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{m.settings_title()}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{m.settings_description()}</p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: '/' })}>
            {m.settings_back_to_projects()}
          </Button>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_openrouter_title()}</CardTitle>
            <CardDescription>{m.settings_openrouter_description()}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor="openrouter-key">{m.settings_openrouter_label()}</Label>
            <Input
              id="openrouter-key"
              type="password"
              placeholder="sk-or-v1-..."
              value={settings.openRouterApiKey}
              onChange={(event) => {
                updateSettings({ openRouterApiKey: event.target.value })
              }}
            />
            <p className="text-muted-foreground text-xs">{m.settings_openrouter_hint()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_ui_title()}</CardTitle>
            <CardDescription>{m.settings_ui_description()}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="theme-mode">{m.settings_theme_label()}</Label>
              <select
                id="theme-mode"
                value={settings.themeMode}
                className="border-input bg-input/30 h-9 rounded-4xl border px-3 text-sm"
                onChange={(event) => {
                  updateSettings({
                    themeMode: event.target.value as 'light' | 'dark' | 'system',
                  })
                }}
              >
                {THEME_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {themeLabel(mode)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="locale">{m.settings_locale_label()}</Label>
              <select
                id="locale"
                value={settings.locale}
                className="border-input bg-input/30 h-9 rounded-4xl border px-3 text-sm"
                onChange={(event) => {
                  updateSettings({ locale: event.target.value as 'en' | 'pl' })
                }}
              >
                <option value="en">{localeLabel('en')}</option>
                <option value="pl">{localeLabel('pl')}</option>
              </select>
            </div>

            <label className="flex items-center gap-3">
              <input
                id="nerd-mode"
                type="checkbox"
                checked={settings.nerdMode}
                onChange={(event) => updateSettings({ nerdMode: event.target.checked })}
                className="accent-primary h-4 w-4 rounded"
              />
              <span>{m.settings_nerd_mode()}</span>
            </label>
          </CardContent>
          <CardFooter className="text-muted-foreground text-xs">
            {m.settings_last_model({ model: settings.lastUsedModel ?? m.common_none() })}
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
