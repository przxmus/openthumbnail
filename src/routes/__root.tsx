import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { SettingsSync } from '@/components/app/settings-sync'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'OpenThumbnail Workshop',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var settingsRaw=localStorage.getItem('openthumbnail.settings.v1');var mode='system';var locale='en';if(settingsRaw){var parsed=JSON.parse(settingsRaw);if(parsed&&typeof parsed.themeMode==='string'){mode=parsed.themeMode;}if(parsed&&typeof parsed.locale==='string'){locale=parsed.locale;}}if(!locale){locale=((navigator.language||'en').toLowerCase().startsWith('pl')?'pl':'en');}var isDark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',isDark);document.documentElement.lang=locale;localStorage.setItem('PARAGLIDE_LOCALE',locale);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <SettingsSync />
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
