import {
  AlertCircle,
  BookOpenText,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCode2,
  Link2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'

import type { Problem, RelationType, UpsertProblemRelationRequest } from '@core/contracts/problem'
import type { TemplateActionRequest, TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { TemplateSourceState } from './use-template-source'
import { CodeViewer } from './code-viewer'
import { TemplateMetadataCard } from './template-metadata-card'
import { TemplateProblemRelationDialog } from './template-problem-relation-dialog'

interface AlgorithmCardProps {
  onAction: (request: TemplateActionRequest) => void
  onClearProblemError: () => void
  onDelete: (templateId: string) => Promise<boolean>
  onOpenProblem: (problemId: string) => void
  onReload: () => void
  onUpsertProblemRelation: (request: UpsertProblemRelationRequest) => Promise<boolean>
  problemError: string | null
  problems: Problem[]
  relatedProblems: Array<{ id: string; relationType: RelationType; title: string }>
  isProblemBusy: boolean
  sourceState: TemplateSourceState
  template: TemplateSummary | null
}

const relationLabels: Record<RelationType, string> = {
  alternative: '备选',
  recommended: '推荐',
  used: '实际使用',
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

export function AlgorithmCard({
  onAction,
  onClearProblemError,
  onDelete,
  onOpenProblem,
  onReload,
  onUpsertProblemRelation,
  problemError,
  problems,
  relatedProblems,
  isProblemBusy,
  sourceState,
  template,
}: AlgorithmCardProps) {
  const [relationDialogOpen, setRelationDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!template) {
    return (
      <section className="relative grid min-h-0 place-items-center overflow-hidden bg-background p-8 text-center">
        <div
          aria-hidden="true"
          className="app-grid-texture pointer-events-none absolute inset-0 opacity-55"
        />
        <div className="relative max-w-sm rounded-3xl border border-border bg-panel/90 px-8 py-9 shadow-panel">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
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
    <section className="flex h-full min-h-0 flex-col bg-background/75">
      <header
        aria-label="模板摘要"
        className="relative overflow-hidden border-b border-primary/12 bg-panel px-5 py-4 shadow-xs"
      >
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div
          aria-hidden="true"
          className="absolute -right-12 -top-20 size-52 rounded-full bg-primary/8 blur-3xl"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="relative min-w-0">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-primary">
              当前模板
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-[-0.03em]">{template.name}</h1>
              <Badge tone="accent">{template.language}</Badge>
            </div>
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={template.relativePath}
            >
              {template.relativePath}
            </p>
          </div>
          <div className="relative flex gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-2 py-1">
                <span className="text-[11px] text-red-600 dark:text-red-300">
                  源文件将备份后删除
                </span>
                <Button
                  disabled={isProblemBusy}
                  onClick={() => void onDelete(template.id)}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  确认删除
                </Button>
                <Button
                  onClick={() => setConfirmDelete(false)}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                aria-label={`删除模板 ${template.name}`}
                disabled={isProblemBusy}
                onClick={() => setConfirmDelete(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-4 text-red-500" />
              </Button>
            )}
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

        <dl className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {[
            ['文件类型', template.extension],
            ['文件大小', formatBytes(template.sizeBytes)],
            ['关联题目', String(relatedProblems.length)],
          ].map(([label, value]) => (
            <div className="flex items-center gap-1.5" key={label}>
              <dt>{label}</dt>
              <dd className="font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-5">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <div>
            <h2 className="text-xs font-semibold">模板源码</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              只读查看 · 可切换 VS Code 主题
            </p>
          </div>
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
          <CodeViewer code={sourceState.value.content} language={sourceState.value.language} />
        )}

        <TemplateMetadataCard key={template.id} templateId={template.id} />

        <section className="mt-4 rounded-2xl border border-border bg-panel p-4 shadow-panel">
          <div className="flex items-center gap-2">
            <BookOpenText aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold">关联题目</h2>
            <Badge className="ml-auto">{relatedProblems.length}</Badge>
            <Button
              disabled={isProblemBusy || problems.length === 0}
              onClick={() => {
                onClearProblemError()
                setRelationDialogOpen(true)
              }}
              size="compact"
              type="button"
              variant="outline"
            >
              <Link2 aria-hidden="true" className="size-3.5" />
              设置关联
            </Button>
          </div>
          {relatedProblems.length === 0 ? (
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              还没有题目使用该模板。点击“设置关联”即可从题库中添加。
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {relatedProblems.map(problem => (
                <button
                  className="interactive-lift flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left outline-none hover:border-primary/25 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
                  key={problem.id}
                  onClick={() => onOpenProblem(problem.id)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{problem.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {relationLabels[problem.relationType]}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <TemplateProblemRelationDialog
        error={problemError}
        isBusy={isProblemBusy}
        onOpenChange={open => {
          setRelationDialogOpen(open)
          if (!open) onClearProblemError()
        }}
        onSave={onUpsertProblemRelation}
        open={relationDialogOpen}
        problems={problems}
        template={template}
      />
    </section>
  )
}
