import type { ComponentProps } from 'react'

import { CommandPalette } from '@/components/command-palette'
import { GettingStartedDialog } from '@/components/getting-started-dialog'
import { CreateTemplateDialog } from '@/features/templates/create-template-dialog'

export function AppDialogs({
  commandPalette,
  createTemplate,
  gettingStarted,
}: {
  commandPalette: ComponentProps<typeof CommandPalette>
  createTemplate: ComponentProps<typeof CreateTemplateDialog>
  gettingStarted: ComponentProps<typeof GettingStartedDialog>
}) {
  return (
    <>
      <CommandPalette {...commandPalette} />
      <CreateTemplateDialog {...createTemplate} />
      <GettingStartedDialog {...gettingStarted} />
    </>
  )
}
