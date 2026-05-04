/**
 * SPEC-008 — T318 — Modal focus-trap hook.
 *
 * Used by every typed-confirmation modal in the governance UI:
 *   - bulk-promote-modal (FR-090h)
 *   - incident-recovery-modal (FR-090i)
 *   - override-grant-form (FR-299)
 *
 * Behavior per FR-090p:
 *   - On open: focus the first interactive element inside the modal.
 *   - Tab cycles forward; Shift+Tab cycles back; cycle wraps inside
 *     the modal — focus never leaks to the document body.
 *   - Esc fires `onCancel`.
 *   - Enter on a disabled submit is a no-op until the typed phrase
 *     matches; the hook does NOT short-circuit Enter — the submit
 *     button's `disabled` attribute is what enforces the no-op.
 *   - On close: restores focus to the element that had focus before
 *     the modal opened.
 *
 * Pure hook; no DOM globals at module-resolution time so server-side
 * rendering remains safe.
 *
 * @see specs/008-resource-governance/spec.md FR-090o, FR-090p
 * @see specs/008-resource-governance/tasks.md T318
 */

'use client'

import { useEffect, useRef } from 'react'

type FocusableElement = HTMLElement & { focus: () => void }

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

interface UseModalFocusTrapOptions {
  /** Whether the modal is currently open. */
  open: boolean
  /** Container ref — the modal's root element. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Called when Escape is pressed. */
  onCancel: () => void
}

/**
 * Install a focus trap on the supplied container while the modal is
 * open. Restores focus to the previously-focused element on close.
 */
export function useModalFocusTrap(opts: UseModalFocusTrapOptions): void {
  const { open, containerRef, onCancel } = opts
  const previouslyFocusedRef = useRef<FocusableElement | null>(null)

  useEffect(() => {
    if (!open) {
      const restore = previouslyFocusedRef.current
      if (restore && typeof restore.focus === 'function') {
        restore.focus()
      }
      previouslyFocusedRef.current = null
      return
    }

    if (typeof document === 'undefined') return

    previouslyFocusedRef.current = (document.activeElement as FocusableElement | null) ?? null

    const container = containerRef.current
    if (!container) return

    const focusables = Array.from(
      container.querySelectorAll<FocusableElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
    const initialFocusable = focusables[0]
    if (initialFocusable) {
      initialFocusable.focus()
    }

    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      const live = Array.from(
        container.querySelectorAll<FocusableElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (live.length === 0) {
        e.preventDefault()
        return
      }
      const first = live[0]
      const last = live[live.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handler)
    return () => {
      container.removeEventListener('keydown', handler)
    }
  }, [open, containerRef, onCancel])
}
