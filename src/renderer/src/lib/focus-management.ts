export function activeElementOrNull(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

export function restoreFocusAfterDialog(event: Event, target: HTMLElement | null | undefined) {
  if (!target?.isConnected) return
  event.preventDefault()

  const focusIfIdle = () => {
    const activeElement = document.activeElement
    const focusIsIdle =
      !activeElement?.isConnected ||
      activeElement === document.body ||
      activeElement === document.documentElement
    if (focusIsIdle && target.isConnected && !target.matches(':disabled')) target.focus()
  }
  window.setTimeout(() => {
    focusIfIdle()
    if (document.activeElement !== target) window.setTimeout(focusIfIdle, 80)
  }, 0)
}
