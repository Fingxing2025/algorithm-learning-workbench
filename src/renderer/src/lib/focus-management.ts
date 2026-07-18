export function activeElementOrNull(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

export function restoreFocusAfterDialog(event: Event, target: HTMLElement | null | undefined) {
  if (!target?.isConnected) return
  event.preventDefault()

  const focus = () => {
    if (target.isConnected && !target.matches(':disabled')) target.focus()
  }
  focus()
  window.requestAnimationFrame(focus)
  window.setTimeout(focus, 80)
}
