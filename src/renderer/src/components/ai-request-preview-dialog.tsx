import * as Dialog from '@radix-ui/react-dialog'
import { Braces, Database, FileText, Image, KeyRound, LoaderCircle, X } from 'lucide-react'

import type { AiRequestPreview } from '@core/contracts/ai-request'

import { Button } from '@/components/ui/button'
import { restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'

const itemIcons = {
  content: FileText,
  excluded: KeyRound,
  image: Image,
  workspace: Database,
} as const

export function AiRequestPreviewDialog({
  allowCancelWhileBusy = false,
  busy,
  onCancel,
  onConfirm,
  preview,
  progressText,
  returnFocusTo,
}: {
  allowCancelWhileBusy?: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  preview: AiRequestPreview
  progressText?: string
  returnFocusTo?: HTMLElement | null
}) {
  const { t } = useI18n()
  return (
    <Dialog.Root onOpenChange={open => !open && (!busy || allowCancelWhileBusy) && onCancel()} open>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[80] bg-overlay/75 backdrop-blur-[4px]" />
        <Dialog.Content
          className="dialog-surface fixed left-1/2 top-1/2 z-[81] flex max-h-[min(760px,calc(100vh-32px))] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/20 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
          onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Braces className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">{t('确认发送给 AI')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('检查 Provider、工作区上下文和用户内容；确认前不会发起网络请求。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭 AI 发送预览')}
              className="ml-auto"
              disabled={busy && !allowCancelWhileBusy}
              onClick={onCancel}
              size="close"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <section className="rounded-xl border border-border bg-background/65 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Provider
                </p>
                <p className="mt-1 text-sm font-semibold">{preview.providerName}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {preview.model}
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {preview.protocol} · {preview.endpointHost}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('视觉输入')}：{preview.capabilities.vision ? t('支持') : t('不支持')} ·{' '}
                  {t('结构化输出')}：
                  {preview.capabilities.structuredOutput ? t('原生支持') : t('本地严格校验')}
                </p>
              </section>
              <section className="rounded-xl border border-border bg-background/65 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('请求概要')}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  ≈ {preview.estimatedInputTokens.toLocaleString()} tokens
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('输出语言')}：{preview.outputLanguage === 'en' ? 'English' : '简体中文'}
                </p>
              </section>
            </div>

            <div className="mt-4 space-y-2">
              {preview.items.map(item => {
                const Icon = itemIcons[item.kind]
                return (
                  <article
                    className="flex gap-3 rounded-xl border border-border bg-background/55 p-3"
                    key={`${item.kind}-${item.label}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">{t(item.label)}</span>
                      <span className="mt-1 block break-words text-[11px] leading-5 text-muted-foreground">
                        {t(item.detail)}
                      </span>
                    </span>
                  </article>
                )
              })}
            </div>

            <section className="mt-4 rounded-xl border border-primary/18 bg-primary/6 p-3 text-xs">
              <p className="font-semibold">{t('Prompt 缓存')}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                {preview.cache.eligible
                  ? `${t('已启用稳定前缀')} · ${preview.cache.key}`
                  : t('当前 Provider 未启用 Prompt 缓存，将使用普通请求。')}
              </p>
              {preview.truncated && (
                <p className="mt-2 text-warning">
                  {t('上下文超过安全上限，发送内容已截断；原始本地文件未被修改。')}
                </p>
              )}
            </section>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            {progressText && (
              <p className="mr-auto text-[11px] font-medium text-primary" role="status">
                {progressText}
              </p>
            )}
            <Button
              disabled={busy && !allowCancelWhileBusy}
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              {t(busy ? '取消生成' : '返回修改')}
            </Button>
            <Button disabled={busy} onClick={onConfirm} type="button">
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {t('确认发送并生成')}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
