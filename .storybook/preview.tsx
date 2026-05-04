import type { Preview } from '@storybook/nextjs-vite'
import { NextIntlClientProvider } from 'next-intl'
import { ThemeProvider } from 'next-themes'
import { useEffect, type ReactNode } from 'react'
import messages from '../messages/en.json'
import '../src/app/globals.css'

const viewports = {
  mobile320: {
    name: 'Mobile 320',
    styles: { width: '320px', height: '844px' },
  },
  mobile375: {
    name: 'Mobile 375',
    styles: { width: '375px', height: '844px' },
  },
  mobile390: {
    name: 'Mobile 390',
    styles: { width: '390px', height: '844px' },
  },
  desktop1366: {
    name: 'Desktop 1366',
    styles: { width: '1366px', height: '768px' },
  },
}

function MissionControlPreview({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="void"
        themes={['void', 'light', 'paper', 'midnight', 'operator']}
        enableSystem={false}
        disableTransitionOnChange
      >
        <div className="min-h-screen bg-background text-foreground">
          {children}
        </div>
      </ThemeProvider>
    </NextIntlClientProvider>
  )
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
    },
    viewport: {
      viewports,
      defaultViewport: 'desktop1366',
    },
    screenshot: {
      fullPage: true,
    },
  },
  decorators: [
    (Story) => (
      <MissionControlPreview>
        <Story />
      </MissionControlPreview>
    ),
  ],
}

export default preview
