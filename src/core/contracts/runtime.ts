import { z } from 'zod'

export const runtimeInfoSchema = z
  .object({
    appVersion: z.string().min(1),
    electronVersion: z.string().min(1),
    isPackaged: z.boolean(),
    platform: z.enum(['darwin', 'linux', 'win32']),
  })
  .strict()

export type RuntimeInfo = z.infer<typeof runtimeInfoSchema>
