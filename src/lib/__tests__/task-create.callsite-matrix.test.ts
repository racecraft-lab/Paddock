import { describe, expect, it } from 'vitest'
import { TASK_CREATE_SOURCE_PROFILES } from '@/lib/task-create'

describe('createTask source profile matrix', () => {
  it('keeps source-specific default side effects explicit', () => {
    expect(TASK_CREATE_SOURCE_PROFILES).toMatchObject({
      api: {
        ticketAllocated: true,
        activityLogged: true,
        creatorSubscribed: true,
        notificationsQueued: true,
        outboundSyncQueued: true,
        broadcastQueued: true,
      },
      github_import: {
        ticketAllocated: false,
        activityLogged: true,
        creatorSubscribed: false,
        notificationsQueued: false,
        outboundSyncQueued: false,
        broadcastQueued: true,
      },
      github_sync: {
        ticketAllocated: false,
        activityLogged: true,
        creatorSubscribed: false,
        notificationsQueued: false,
        outboundSyncQueued: false,
        broadcastQueued: false,
      },
      recurring: {
        ticketAllocated: true,
        activityLogged: true,
        creatorSubscribed: false,
        notificationsQueued: false,
        outboundSyncQueued: false,
        broadcastQueued: false,
      },
      pipeline_successor: {
        ticketAllocated: true,
        activityLogged: true,
        creatorSubscribed: false,
        notificationsQueued: true,
        outboundSyncQueued: true,
        broadcastQueued: true,
      },
    })
  })
})
