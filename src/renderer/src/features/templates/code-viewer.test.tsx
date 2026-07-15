import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { CodeViewer } from './code-viewer'

describe('CodeViewer', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders C++ with a read-only editor surface without rendering source as HTML', () => {
    render(<CodeViewer code={'int main() { return 0; }\n// <script>'} language="C++" />)

    const source = screen.getByLabelText('高亮模板源码')
    expect(source.querySelector('.cm-line')).not.toBeNull()
    expect(source.querySelector('script')).toBeNull()
    expect(source.textContent).toContain('<script>')
  })

  it('persists an independently selected VS Code theme', () => {
    render(<CodeViewer code="const value = 1" language="TypeScript" />)
    fireEvent.change(screen.getByLabelText('代码主题'), { target: { value: 'vscode-dark' } })

    expect(window.localStorage.getItem('ui:code-theme')).toBe('vscode-dark')
    expect(screen.getByLabelText('高亮模板源码')).toHaveAttribute('data-code-theme', 'vscode-dark')
  })

  it('offers a large focus mode that closes with Escape', () => {
    render(<CodeViewer code={'int main() {}\n'} language="C++" />)

    const viewer = screen.getByLabelText('模板代码查看器')
    fireEvent.click(screen.getByRole('button', { name: '进入代码专注模式' }))
    expect(viewer).toHaveAttribute('data-expanded', 'true')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(viewer).toHaveAttribute('data-expanded', 'false')
  })
})
