import { AlertCircle, Copy, ExternalLink, FileCode2, RefreshCw } from 'lucide-react'

import type { TemplateActionRequest, TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { TemplateSourceState } from './use-template-source'

interface AlgorithmCardProps {
  onAction: (request: TemplateActionRequest) => void
  onReload: () => void
  sourceState: TemplateSourceState
  template: TemplateSummary | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function AlgorithmCard({ onAction, onReload, sourceState, template }: AlgorithmCardProps) {
  if (!template) {
    return (
      <section className="grid min-h-0 place-items-center bg-background p-8 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <FileCode2 aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 text-sm font-semibold">选择一份算法模板</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            从左侧模板树打开源码；搜索结果也会自动定位并展开对应目录。
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-col bg-background">
      <header className="border-b border-border bg-panel px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{template.name}</h1>
              <Badge tone="accent">{template.language}</Badge>
            </div>
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={template.relativePath}
            >
              {template.relativePath}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => onAction({ action: 'copy-source', templateId: template.id })}
              size="compact"
              type="button"
              variant="outline"
            >
              <Copy aria-hidden="true" className="size-3.5" />
              复制源码
            </Button>
            <Button
              aria-label="在文件管理器中显示"
              onClick={() => onAction({ action: 'reveal', templateId: template.id })}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-4">
          {[
            ['文件类型', template.extension],
            ['文件大小', formatBytes(template.sizeBytes)],
            ['时间复杂度', '待补充'],
            ['关联题目', '0'],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2" key={label}>
              <dt className="text-[10px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-xs font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold">模板源码</h2>
          <Button
            aria-label="重新读取源码"
            onClick={onReload}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        {sourceState.status === 'loading' && (
          <div className="min-h-0 flex-1 animate-pulse rounded-xl border border-border bg-muted/45" />
        )}
        {sourceState.status === 'error' && (
          <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <div>
              <AlertCircle aria-hidden="true" className="mx-auto size-6 text-red-500" />
              <p className="mt-3 text-sm font-medium">源码读取失败</p>
              <p className="mt-1 text-xs text-muted-foreground">{sourceState.message}</p>
              <Button
                className="mt-4"
                onClick={onReload}
                size="compact"
                type="button"
                variant="outline"
              >
                重试
              </Button>
            </div>
          </div>
        )}
        {sourceState.status === 'ready' && (
          <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-code p-4 font-mono text-xs leading-5 text-code-foreground shadow-inner">
            <code>{sourceState.value.content || '// 空模板文件'}</code>
          </pre>
        )}
      </div>
    </section>
  )
}
