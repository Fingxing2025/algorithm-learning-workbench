import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { CodeViewer } from './code-viewer'

describe('CodeViewer', () => {
  beforeEach(() => window.localStorage.clear())

  it('highlights registered template languages without rendering source as HTML', () => {
    render(<CodeViewer code={'int main() { return 0; }\n// <script>'} language="C++" />)

    const source = screen.getByLabelText('高亮模板源码')
    expect(source.querySelector('.hljs-type')).not.toBeNull()
    expect(source.querySelector('script')).toBeNull()
    expect(source.textContent).toContain('<script>')
  })

  it('persists an independently selected VS Code theme', () => {
    render(<CodeViewer code="const value = 1" language="TypeScript" />)
    fireEvent.change(screen.getByLabelText('代码主题'), { target: { value: 'vscode-dark' } })

    expect(window.localStorage.getItem('ui:code-theme')).toBe('vscode-dark')
    expect(screen.getByLabelText('高亮模板源码')).toHaveAttribute('data-code-theme', 'vscode-dark')
  })
})
