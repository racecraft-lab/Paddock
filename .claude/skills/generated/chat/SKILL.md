---
name: chat
description: "Skill for the Chat area of mission-control. 48 symbols across 9 files."
---

# Chat

48 symbols | 9 files | Cohesion: 92%

## When to Use

- Working with code in `src/`
- Understanding how shouldShowTimestamp, getSessionKindLabel, SessionKindAvatar work
- Modifying chat-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/chat/conversation-list.tsx` | asRecord, readString, readNumber, readSessionPrefs, readSessions (+8) |
| `src/components/chat/session-message.tsx` | shouldShowTimestamp, TextPart, renderSessionContent, renderInlineFormatting, renderInlineText (+2) |
| `src/components/chat/chat-workspace.tsx` | SessionConversationView, handleContinueSession, ChatWorkspace, check, loadAgents (+1) |
| `src/components/chat/message-bubble.tsx` | getAgentTheme, formatTime, asRecord, renderContent, ToolCallBubble (+1) |
| `src/components/chat/message-list.tsx` | formatDateGroup, groupMessagesByDate, isGroupedWithPrevious, MessageList, handleRetry |
| `src/components/chat/chat-input.tsx` | ChatInput, handleKeyDown, insertMention, handleSend, formatFileSize |
| `src/components/chat/session-kind-brand.tsx` | getMeta, getSessionKindLabel, SessionKindAvatar, SessionKindPill |
| `src/components/panels/task-board-panel.tsx` | TaskSessionFeed |
| `src/lib/chat-utils.ts` | detectTextDirection |

## Entry Points

Start here when exploring this area:

- **`shouldShowTimestamp`** (Function) — `src/components/chat/session-message.tsx:135`
- **`getSessionKindLabel`** (Function) — `src/components/chat/session-kind-brand.tsx:50`
- **`SessionKindAvatar`** (Function) — `src/components/chat/session-kind-brand.tsx:54`
- **`SessionKindPill`** (Function) — `src/components/chat/session-kind-brand.tsx:94`
- **`ConversationList`** (Function) — `src/components/chat/conversation-list.tsx:127`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `shouldShowTimestamp` | Function | `src/components/chat/session-message.tsx` | 135 |
| `getSessionKindLabel` | Function | `src/components/chat/session-kind-brand.tsx` | 50 |
| `SessionKindAvatar` | Function | `src/components/chat/session-kind-brand.tsx` | 54 |
| `SessionKindPill` | Function | `src/components/chat/session-kind-brand.tsx` | 94 |
| `ConversationList` | Function | `src/components/chat/conversation-list.tsx` | 127 |
| `startRename` | Function | `src/components/chat/conversation-list.tsx` | 222 |
| `setColor` | Function | `src/components/chat/conversation-list.tsx` | 242 |
| `detectTextDirection` | Function | `src/lib/chat-utils.ts` | 3 |
| `MessageBubble` | Function | `src/components/chat/message-bubble.tsx` | 161 |
| `MessageList` | Function | `src/components/chat/message-list.tsx` | 49 |
| `handleRetry` | Function | `src/components/chat/message-list.tsx` | 97 |
| `handleContextMenu` | Function | `src/components/chat/conversation-list.tsx` | 213 |
| `commitRename` | Function | `src/components/chat/conversation-list.tsx` | 229 |
| `handleSelect` | Function | `src/components/chat/conversation-list.tsx` | 331 |
| `renderConversationItem` | Function | `src/components/chat/conversation-list.tsx` | 356 |
| `ChatInput` | Function | `src/components/chat/chat-input.tsx` | 15 |
| `handleKeyDown` | Function | `src/components/chat/chat-input.tsx` | 106 |
| `insertMention` | Function | `src/components/chat/chat-input.tsx` | 154 |
| `handleSend` | Function | `src/components/chat/chat-input.tsx` | 174 |
| `formatFileSize` | Function | `src/components/chat/chat-input.tsx` | 185 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Panels | 6 calls |

## How to Explore

1. `gitnexus_context({name: "shouldShowTimestamp"})` — see callers and callees
2. `gitnexus_query({query: "chat"})` — find related execution flows
3. Read key files listed above for implementation details
