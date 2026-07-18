import * as ContextMenu from '@radix-ui/react-context-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Folder,
  FolderOpen,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { TemplateActionRequest, TemplateSummary } from '@core/contracts/workspace'

import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import {
  buildTemplateTree,
  flattenTemplateTree,
  getDirectoryRowIds,
  getExpansionIdsForTemplate,
  type FlatTemplateTreeRow,
} from './template-tree-model'

interface TemplateTreeProps {
  onAction: (request: TemplateActionRequest) => void
  onSelect: (templateId: string) => void
  revealTemplateId: string | null
  selectedTemplateId: string | null
  templates: TemplateSummary[]
  workspaceId: string
}

interface ExpansionState {
  ids: Set<string>
  workspaceId: string
}

const EXPANSION_STORAGE_PREFIX = 'template-tree:expanded:'

function readStoredExpansion(workspaceId: string, validIds: Set<string>): Set<string> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(`${EXPANSION_STORAGE_PREFIX}${workspaceId}`) ?? '[]',
    )
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string' && validIds.has(value)),
    )
  } catch {
    return new Set()
  }
}

export function TemplateTree({
  onAction,
  onSelect,
  revealTemplateId,
  selectedTemplateId,
  templates,
  workspaceId,
}: TemplateTreeProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const tree = useMemo(() => buildTemplateTree(templates), [templates])
  const validDirectoryIds = useMemo(() => getDirectoryRowIds(tree), [tree])
  const [expansionState, setExpansionState] = useState<ExpansionState>(() => ({
    ids: readStoredExpansion(workspaceId, validDirectoryIds),
    workspaceId,
  }))
  const [temporaryExpandedIds, setTemporaryExpandedIds] = useState<Set<string>>(new Set())
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setExpansionState(current => {
      if (current.workspaceId !== workspaceId) {
        return { ids: readStoredExpansion(workspaceId, validDirectoryIds), workspaceId }
      }
      return {
        ids: new Set([...current.ids].filter(id => validDirectoryIds.has(id))),
        workspaceId,
      }
    })
    setTemporaryExpandedIds(new Set())
    setFocusedIndex(0)
  }, [validDirectoryIds, workspaceId])

  useEffect(() => {
    if (expansionState.workspaceId !== workspaceId) return
    localStorage.setItem(
      `${EXPANSION_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify([...expansionState.ids].sort()),
    )
  }, [expansionState, workspaceId])

  useEffect(() => {
    if (!revealTemplateId) {
      return
    }
    const selectedTemplate = templates.find(template => template.id === revealTemplateId)
    if (!selectedTemplate) {
      return
    }
    const revealIds = getExpansionIdsForTemplate(tree, selectedTemplate)
    setTemporaryExpandedIds(new Set(revealIds))
  }, [revealTemplateId, templates, tree])

  const expandedIds = useMemo(
    () => new Set([...expansionState.ids, ...temporaryExpandedIds]),
    [expansionState.ids, temporaryExpandedIds],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
    if (normalizedQuery) {
      return templates
        .filter(template =>
          `${template.name} ${template.relativePath} ${template.language}`
            .toLocaleLowerCase('zh-CN')
            .includes(normalizedQuery),
        )
        .map<FlatTemplateTreeRow>(template => ({
          depth: 0,
          id: `template:${template.id}`,
          kind: 'template',
          label: template.fileName,
          relativePath: template.relativePath,
          template,
        }))
    }
    return flattenTemplateTree(tree, expandedIds)
  }, [expandedIds, query, templates, tree])

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 36,
    getScrollElement: () => scrollRef.current,
    getItemKey: index => rows[index]?.id ?? index,
    overscan: 10,
  })

  useEffect(() => {
    if (!selectedTemplateId) {
      return
    }
    const selectedIndex = rows.findIndex(row =>
      row.kind === 'template' ? row.template.id === selectedTemplateId : false,
    )
    if (selectedIndex >= 0) {
      setFocusedIndex(selectedIndex)
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [rows, selectedTemplateId, virtualizer])

  const toggleDirectory = (row: Extract<FlatTemplateTreeRow, { kind: 'directory' }>) => {
    setExpansionState(current => {
      const next = new Set(current.workspaceId === workspaceId ? current.ids : [])
      if (expandedIds.has(row.id)) {
        next.delete(row.id)
        setTemporaryExpandedIds(temporary => {
          const nextTemporary = new Set(temporary)
          nextTemporary.delete(row.id)
          return nextTemporary
        })
      } else {
        next.add(row.id)
      }
      return { ids: next, workspaceId }
    })
  }

  const activateRow = (row: FlatTemplateTreeRow) => {
    if (row.kind === 'directory') {
      toggleDirectory(row)
    } else {
      onSelect(row.template.id)
    }
  }

  const focusRow = (index: number) => {
    const nextIndex = Math.min(rows.length - 1, Math.max(0, index))
    setFocusedIndex(nextIndex)
    virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
  }

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) {
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      focusRow(focusedIndex + delta)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusRow(event.key === 'Home' ? 0 : rows.length - 1)
      return
    }

    const focusedRow = rows[focusedIndex]
    if (!focusedRow) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activateRow(focusedRow)
    } else if (event.key === 'ArrowRight' && focusedRow.kind === 'directory') {
      event.preventDefault()
      if (expandedIds.has(focusedRow.id)) {
        const firstChild = rows[focusedIndex + 1]
        if (firstChild && firstChild.depth > focusedRow.depth) focusRow(focusedIndex + 1)
      } else {
        setExpansionState(current => ({
          ids: new Set(current.workspaceId === workspaceId ? current.ids : []).add(focusedRow.id),
          workspaceId,
        }))
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (focusedRow.kind === 'directory' && expandedIds.has(focusedRow.id)) {
        setTemporaryExpandedIds(current => {
          const next = new Set(current)
          next.delete(focusedRow.id)
          return next
        })
        setExpansionState(current => {
          const next = new Set(current.workspaceId === workspaceId ? current.ids : [])
          next.delete(focusedRow.id)
          return { ids: next, workspaceId }
        })
      } else {
        for (let index = focusedIndex - 1; index >= 0; index -= 1) {
          if (rows[index]!.depth < focusedRow.depth) {
            focusRow(index)
            break
          }
        }
      }
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar/75">
      <div className="border-b border-border px-3 py-3.5">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            {t('工作区文件')}
          </span>
          <span className="rounded-md bg-panel px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground ring-1 ring-border">
            {templates.length}
          </span>
        </div>
        <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-panel px-3 shadow-xs transition-colors focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-ring">
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <input
            aria-label={t('筛选模板树')}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            onChange={event => setQuery(event.target.value)}
            placeholder={t('筛选当前工作区')}
            value={query}
          />
        </div>
        <p className="mt-2.5 px-1 text-[10px] text-muted-foreground">
          {query ? `${rows.length} ${t('个匹配结果')}` : `${templates.length} ${t('个模板')}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <FileCode2 aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-xs font-medium">
              {t(query ? '没有匹配模板' : '工作区还是空的')}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {t(query ? '尝试缩短关键词。' : '使用右上角“新建模板”添加第一份源码。')}
            </p>
          </div>
        </div>
      ) : (
        <div
          aria-activedescendant={
            rows[focusedIndex] ? `tree-row-${rows[focusedIndex].id}` : undefined
          }
          aria-label={t('模板树')}
          className="min-h-0 flex-1 overflow-auto py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onKeyDown={handleTreeKeyDown}
          ref={scrollRef}
          role="tree"
          tabIndex={0}
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = rows[virtualRow.index]
              if (!row) {
                return null
              }
              const isFocused = virtualRow.index === focusedIndex
              const isSelected = row.kind === 'template' && row.template.id === selectedTemplateId
              const isExpanded = row.kind === 'directory' && expandedIds.has(row.id)
              const rowButton = (
                <button
                  aria-expanded={row.kind === 'directory' ? isExpanded : undefined}
                  aria-level={row.depth + 1}
                  aria-selected={row.kind === 'template' ? isSelected : undefined}
                  className={cn(
                    'absolute left-1.5 top-0 flex h-9 w-[calc(100%-12px)] items-center gap-2 rounded-lg pr-3 text-left text-xs outline-none transition-all duration-150',
                    isSelected
                      ? 'bg-primary/12 font-medium text-primary shadow-xs ring-1 ring-primary/10'
                      : isFocused
                        ? 'bg-panel text-foreground'
                        : 'text-muted-foreground hover:translate-x-0.5 hover:bg-panel/85 hover:text-foreground',
                  )}
                  id={`tree-row-${row.id}`}
                  onClick={() => {
                    setFocusedIndex(virtualRow.index)
                    activateRow(row)
                  }}
                  role="treeitem"
                  style={{
                    paddingLeft: 10 + row.depth * 16,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  tabIndex={-1}
                  type="button"
                >
                  {row.kind === 'directory' ? (
                    <>
                      {isExpanded ? (
                        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
                      )}
                      {isExpanded ? (
                        <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      ) : (
                        <Folder aria-hidden="true" className="size-4 shrink-0" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="size-3.5 shrink-0" />
                      <FileCode2 aria-hidden="true" className="size-4 shrink-0" />
                    </>
                  )}
                  <span className="truncate" title={row.relativePath}>
                    {row.label}
                  </span>
                </button>
              )

              if (row.kind === 'directory') {
                return <div key={row.id}>{rowButton}</div>
              }

              return (
                <ContextMenu.Root key={row.id}>
                  <ContextMenu.Trigger asChild>{rowButton}</ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className="z-50 min-w-48 rounded-lg border border-border bg-panel p-1 text-xs shadow-xl">
                      <ContextMenu.Item
                        className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-muted"
                        onSelect={() =>
                          onAction({ action: 'copy-source', templateId: row.template.id })
                        }
                      >
                        <Copy aria-hidden="true" className="size-3.5" />
                        {t('复制源码')}
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-muted"
                        onSelect={() =>
                          onAction({ action: 'copy-relative-path', templateId: row.template.id })
                        }
                      >
                        <Copy aria-hidden="true" className="size-3.5" />
                        {t('复制相对路径')}
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="my-1 h-px bg-border" />
                      <ContextMenu.Item
                        className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-muted"
                        onSelect={() => onAction({ action: 'reveal', templateId: row.template.id })}
                      >
                        <FolderOpen aria-hidden="true" className="size-3.5" />
                        {t('在文件管理器中显示')}
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
