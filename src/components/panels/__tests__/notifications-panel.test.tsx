import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsPanel } from '../notifications-panel'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    title: 'Notifications',
    markAllRead: 'Mark All Read',
    recipientLabel: 'Recipient',
    recipientPlaceholder: 'Agent name',
    noNotifications: 'No notifications',
    markRead: 'Mark read',
    readyForOwnerActionRequired: 'Owner action required',
  }[key] || key),
}))

vi.mock('@/store', () => ({
  usePaddock: () => ({ activeProductLineScope: null }),
}))

vi.mock('@/lib/use-smart-poll', () => ({
  useSmartPoll: vi.fn(),
}))

describe('NotificationsPanel ready-for-owner notifications', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const storage = new Map<string, string>([['mc.notifications.recipient', 'owner-agent']])
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) || null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
        removeItem: vi.fn((key: string) => storage.delete(key)),
      },
    })
  })

  it('renders normal and reconciliation task_ready_for_owner notifications with action-required text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      notifications: [
        {
          id: 1,
          recipient: 'owner-agent',
          type: 'task_ready_for_owner',
          title: 'Ready for owner merge',
          message: 'Merge Task A.',
          source_type: 'task',
          source_id: 10,
          read_at: null,
          created_at: 1893456000,
        },
        {
          id: 2,
          recipient: 'owner-agent',
          type: 'task_ready_for_owner',
          title: 'Owner merge reconciliation required',
          message: 'GitHub issue #90 closed without merged PR evidence.',
          source_type: 'task',
          source_id: 11,
          read_at: null,
          created_at: 1893456001,
        },
      ],
    })))

    render(<NotificationsPanel />)

    expect(await screen.findByText('Ready for owner merge')).toBeInTheDocument()
    expect(screen.getByText('Owner merge reconciliation required')).toBeInTheDocument()
    expect(screen.getAllByText('task_ready_for_owner')).toHaveLength(2)
    await waitFor(() => {
      expect(screen.getAllByText('Owner action required')).toHaveLength(2)
    })
  })
})
