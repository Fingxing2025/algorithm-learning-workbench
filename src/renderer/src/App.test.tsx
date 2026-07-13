import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        app: {
          getRuntimeInfo: vi.fn().mockResolvedValue({
            appVersion: '0.1.0',
            electronVersion: '43.1.0',
            isPackaged: false,
            platform: 'darwin',
          }),
        },
      },
    })
  })

  it('renders the desktop baseline and runtime status', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeInTheDocument()
    expect(await screen.findByText('Electron 43.1.0 · darwin')).toBeInTheDocument()
    expect(screen.getByText('尚未连接工作区')).toBeInTheDocument()
  })

  it('opens the global search and switches theme', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('全局搜索已就绪')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭全局搜索' }))
    await user.click(screen.getByRole('button', { name: '切换到深色主题' }))
    expect(document.documentElement).toHaveClass('dark')
  })
})
