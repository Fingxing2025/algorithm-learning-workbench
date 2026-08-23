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

  it('adds C++-specific semantic colors, bracket depth colors, and indentation guides', () => {
    render(
      <CodeViewer
        code={
          '#include <vector>\nint main() {\n    std::vector<int> values;\n    if (values.empty()) {\n        return 0;\n    }\n}'
        }
        language="C++"
      />,
    )

    const source = screen.getByLabelText('高亮模板源码')
    expect(source.querySelector('.cm-cpp-header')).toHaveTextContent('<vector>')
    expect(source.querySelector('.cm-cpp-primitive-type')).toHaveTextContent('int')
    expect(source.querySelector('.cm-rainbow-bracket-0')).not.toBeNull()
    expect(source.querySelector('.cm-rainbow-bracket-1')).not.toBeNull()
    expect(source.querySelector('.cm-indent-guides')).not.toBeNull()
  })

  it('persists an independently selected VS Code theme', () => {
    render(<CodeViewer code="const value = 1" language="TypeScript" />)
    fireEvent.change(screen.getByLabelText('代码主题'), { target: { value: 'vscode-dark' } })

    expect(window.localStorage.getItem('ui:code-theme')).toBe('vscode-dark')
    expect(screen.getByLabelText('高亮模板源码')).toHaveAttribute('data-code-theme', 'vscode-dark')
  })

  it('offers a large focus mode that closes with Escape', () => {
    render(
      <div data-testid="stacking-ancestor" style={{ transform: 'translateZ(0)' }}>
        <CodeViewer code={'int main() {}\n'} language="C++" />
      </div>,
    )

    const enterButton = screen.getByRole('button', { name: '进入代码专注模式' })
    fireEvent.click(enterButton)
    const expandedViewer = screen.getByLabelText('模板代码查看器')
    expect(expandedViewer).toHaveAttribute('data-expanded', 'true')
    expect(expandedViewer.parentElement).toBe(document.body)
    expect(expandedViewer.closest('[data-testid="stacking-ancestor"]')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('button', { name: '退出代码专注模式' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    const collapsedViewer = screen.getByLabelText('模板代码查看器')
    expect(collapsedViewer).toHaveAttribute('data-expanded', 'false')
    expect(collapsedViewer.closest('[data-testid="stacking-ancestor"]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(screen.getByRole('button', { name: '进入代码专注模式' })).toHaveFocus()
  })
})
