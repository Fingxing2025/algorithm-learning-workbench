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

import { cn } from '@/lib/utils'

import {
  buildTemplateTree,
  flattenTemplateTree,
  getDefaultExpandedIds,
  getExpansionIdsForTemplate,
  type FlatTemplateTreeRow,
} from './template-tree-model'

interface TemplateTreeProps {
  onAction: (request: TemplateActionRequest) => void
  onSelect: (templateId: string) => void
  selectedTemplateId: string | null
  templates: TemplateSummary[]
}

export function TemplateTree({
  onAction,
  onSelect,
  selectedTemplateId,
  templates,
}: TemplateTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tree = useMemo(() => buildTemplateTree(templates), [templates])
  const [expandedIds, setExpandedIds] = useState(() => getDefaultExpandedIds(tree))
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setExpandedIds(getDefaultExpandedIds(tree))
    setFocusedIndex(0)
  }, [tree])

  useEffect(() => {
    if (!selectedTemplateId) {
      return
    }
    const selectedTemplate = templates.find(template => template.id === selectedTemplateId)
    if (!selectedTemplate) {
      return
    }
    const revealIds = getExpansionIdsForTemplate(tree, selectedTemplate)
    setExpandedIds(current => new Set([...current, ...revealIds]))
  }, [selectedTemplateId, templates, tree])

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
    setExpandedIds(current => {
      const next = new Set(current)
      if (next.has(row.id)) {
        next.delete(row.id)
      } else {
        next.add(row.id)
      }
      return next
    })
  }

  const activateRow = (row: FlatTemplateTreeRow) => {
    if (row.kind === 'directory') {
      toggleDirectory(row)
    } else {
      onSelect(row.template.id)
    }
  }

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) {
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = Math.min(rows.length - 1, Math.max(0, focusedIndex + delta))
      setFocusedIndex(nextIndex)
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
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
      setExpandedIds(current => new Set(current).add(focusedRow.id))
    } else if (event.key === 'ArrowLeft' && focusedRow.kind === 'directory') {
      event.preventDefault()
      setExpandedIds(current => {
        const next = new Set(current)
        next.delete(focusedRow.id)
        return next
      })
    }
  }

  return (
    <section className="flex min-h-0 flex-col border-r border-border bg-sidebar/65">
      <div className="border-b border-border p-3">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 shadow-xs focus-within:ring-2 focus-within:ring-ring">
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <input
            aria-label="筛选模板树"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            onChange={event => setQuery(event.target.value)}
            placeholder="筛选当前工作区"
            value={query}
          />
        </div>
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">
          {query ? `${rows.length} 个匹配结果` : `${templates.length} 个模板`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <FileCode2 aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-xs font-medium">{query ? '没有匹配模板' : '工作区还是空的'}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {query ? '尝试缩短关键词。' : '使用右上角“新建模板”添加第一份源码。'}
            </p>
          </div>
        </div>
      ) : (
        <div
          aria-activedescendant={
            rows[focusedIndex] ? `tree-row-${rows[focusedIndex].id}` : undefined
          }
          aria-label="模板树"
          className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                    'absolute left-0 top-0 flex h-9 w-full items-center gap-2 pr-3 text-left text-xs outline-none transition-colors',
                    isSelected
                      ? 'bg-primary/12 text-primary'
                      : isFocused
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                  id={`tree-row-${row.id}`}
                  onClick={() => {
                    setFocusedIndex(virtualRow.index)
                    activateRow(row)
                  }}
                  role="treeitem"
                  style={{
                    paddingLeft: 12 + row.depth * 16,
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
                        复制源码
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-muted"
                        onSelect={() =>
                          onAction({ action: 'copy-relative-path', templateId: row.template.id })
                        }
                      >
                        <Copy aria-hidden="true" className="size-3.5" />
                        复制相对路径
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="my-1 h-px bg-border" />
                      <ContextMenu.Item
                        className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-muted"
                        onSelect={() => onAction({ action: 'reveal', templateId: row.template.id })}
                      >
                        <FolderOpen aria-hidden="true" className="size-3.5" />
                        在文件管理器中显示
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
