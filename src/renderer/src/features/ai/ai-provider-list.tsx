import { Bot, ChevronRight, ServerCog } from 'lucide-react'

import type { AiProviderProfile } from '@core/contracts/ai-provider'

import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface AiProviderListProps {
  onSelect: (profile: AiProviderProfile) => void
  profiles: AiProviderProfile[]
  selectedId: string | null
}

export function AiProviderList({ onSelect, profiles, selectedId }: AiProviderListProps) {
  const { t } = useI18n()

  return (
    <aside className="h-full min-h-0 overflow-y-auto bg-sidebar/75 p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
          {t('Provider 配置')}
        </span>
        <span className="rounded-md bg-panel px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground ring-1 ring-border">
          {profiles.length}
        </span>
      </div>
      {profiles.length === 0 ? (
        <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-border bg-panel/50 p-5 text-center">
          <div>
            <Bot className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{t('还没有 AI Provider')}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('可先配置云端服务或本机 Ollama。')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {profiles.map(profile => (
            <button
              aria-current={selectedId === profile.id ? 'true' : undefined}
              className={cn(
                'interactive-lift flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedId === profile.id
                  ? 'border-primary/20 bg-primary/10 shadow-xs'
                  : 'border-transparent hover:border-border hover:bg-panel',
              )}
              key={profile.id}
              onClick={() => onSelect(profile)}
              type="button"
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
                  selectedId === profile.id
                    ? 'bg-primary/12 text-primary ring-primary/12'
                    : 'bg-muted text-muted-foreground ring-border',
                )}
              >
                <ServerCog className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{profile.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {profile.model}
                </span>
              </span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
