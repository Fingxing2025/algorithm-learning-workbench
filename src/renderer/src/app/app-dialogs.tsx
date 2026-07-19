import type { ComponentProps } from 'react'

import { CommandPalette } from '@/components/command-palette'
import { CreateTemplateDialog } from '@/features/templates/create-template-dialog'

export function AppDialogs({
  commandPalette,
  createTemplate,
}: {
  commandPalette: ComponentProps<typeof CommandPalette>
  createTemplate: ComponentProps<typeof CreateTemplateDialog>
}) {
  return (
    <>
      <CommandPalette {...commandPalette} />
      <CreateTemplateDialog {...createTemplate} />
    </>
  )
}
