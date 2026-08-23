import type { TemplateSummary } from '@core/contracts/workspace'

export interface TemplateDirectoryNode {
  directories: Map<string, TemplateDirectoryNode>
  name: string
  relativePath: string
  templates: TemplateSummary[]
}

export type FlatTemplateTreeRow =
  | {
      depth: number
      id: string
      kind: 'directory'
      label: string
      relativePath: string
    }
  | {
      depth: number
      id: string
      kind: 'template'
      label: string
      relativePath: string
      template: TemplateSummary
    }

interface CollapsedDirectory {
  endNode: TemplateDirectoryNode
  label: string
}

function createDirectory(name: string, relativePath: string): TemplateDirectoryNode {
  return { directories: new Map(), name, relativePath, templates: [] }
}

export function buildTemplateTree(templates: TemplateSummary[]): TemplateDirectoryNode {
  const root = createDirectory('', '')

  for (const template of templates) {
    const parts = template.relativePath.split('/')
    const directoryParts = parts.slice(0, -1)
    let current = root

    for (let index = 0; index < directoryParts.length; index += 1) {
      const name = directoryParts[index]
      if (!name) {
        continue
      }
      const relativePath = directoryParts.slice(0, index + 1).join('/')
      let child = current.directories.get(name)
      if (!child) {
        child = createDirectory(name, relativePath)
        current.directories.set(name, child)
      }
      current = child
    }

    current.templates.push(template)
  }

  return root
}

function collapseDirectory(directory: TemplateDirectoryNode): CollapsedDirectory {
  const labels = [directory.name]
  let endNode = directory

  while (endNode.templates.length === 0 && endNode.directories.size === 1) {
    const child = endNode.directories.values().next().value as TemplateDirectoryNode | undefined
    if (!child) {
      break
    }
    labels.push(child.name)
    endNode = child
  }

  return { endNode, label: labels.join(' / ') }
}

function sortedDirectories(directory: TemplateDirectoryNode): TemplateDirectoryNode[] {
  return [...directory.directories.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-CN'),
  )
}

export function directoryRowId(relativePath: string): string {
  return `directory:${relativePath}`
}

export function getDefaultExpandedIds(root: TemplateDirectoryNode): Set<string> {
  void root
  return new Set()
}

export function getDirectoryRowIds(root: TemplateDirectoryNode): Set<string> {
  const ids = new Set<string>()
  const visit = (directory: TemplateDirectoryNode) => {
    const collapsed = collapseDirectory(directory)
    ids.add(directoryRowId(collapsed.endNode.relativePath))
    for (const child of sortedDirectories(collapsed.endNode)) visit(child)
  }
  for (const directory of sortedDirectories(root)) visit(directory)
  return ids
}

export function getExpansionIdsForTemplate(
  root: TemplateDirectoryNode,
  template: TemplateSummary,
): string[] {
  const directoryParts = template.relativePath.split('/').slice(0, -1)
  const ids: string[] = []
  let current = root
  let partIndex = 0

  while (partIndex < directoryParts.length) {
    const next = current.directories.get(directoryParts[partIndex] ?? '')
    if (!next) {
      break
    }
    const collapsed = collapseDirectory(next)
    ids.push(directoryRowId(collapsed.endNode.relativePath))
    current = collapsed.endNode
    partIndex = collapsed.endNode.relativePath.split('/').length
  }

  return ids
}

export function flattenTemplateTree(
  root: TemplateDirectoryNode,
  expandedIds: Set<string>,
): FlatTemplateTreeRow[] {
  const rows: FlatTemplateTreeRow[] = []

  const appendDirectory = (directory: TemplateDirectoryNode, depth: number) => {
    const collapsed = collapseDirectory(directory)
    const id = directoryRowId(collapsed.endNode.relativePath)
    rows.push({
      depth,
      id,
      kind: 'directory',
      label: collapsed.label,
      relativePath: collapsed.endNode.relativePath,
    })

    if (!expandedIds.has(id)) {
      return
    }

    for (const child of sortedDirectories(collapsed.endNode)) {
      appendDirectory(child, depth + 1)
    }
    for (const template of [...collapsed.endNode.templates].sort((left, right) =>
      left.fileName.localeCompare(right.fileName, 'zh-CN'),
    )) {
      rows.push({
        depth: depth + 1,
        id: `template:${template.id}`,
        kind: 'template',
        label: template.fileName,
        relativePath: template.relativePath,
        template,
      })
    }
  }

  for (const directory of sortedDirectories(root)) {
    appendDirectory(directory, 0)
  }
  for (const template of [...root.templates].sort((left, right) =>
    left.fileName.localeCompare(right.fileName, 'zh-CN'),
  )) {
    rows.push({
      depth: 0,
      id: `template:${template.id}`,
      kind: 'template',
      label: template.fileName,
      relativePath: template.relativePath,
      template,
    })
  }

  return rows
}
