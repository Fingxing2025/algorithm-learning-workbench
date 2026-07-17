import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, ArrowRight, FilePenLine, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  FileChangeMutationResult,
  TemplateRelocationPreview,
} from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface TemplateRelocationDialogProps {
  onCompleted: (templateId: string, result: FileChangeMutationResult) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  template: TemplateSummary
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

export function TemplateRelocationDialog({
  onCompleted,
  onOpenChange,
  open,
  template,
}: TemplateRelocationDialogProps) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<TemplateRelocationPreview | null>(null)
  const [targetRelativePath, setTargetRelativePath] = useState(template.relativePath)

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError(null)
    setPreview(null)
    setTargetRelativePath(template.relativePath)
  }, [open, template.id, template.relativePath])

  const loadPreview = async () => {
    setBusy(true)
    setError(null)
    try {
      setPreview(
        await window.desktop.templateManagement.previewTemplateRelocation({
          targetRelativePath,
          templateId: template.id,
        }),
      )
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.desktop.templateManagement.applyTemplateRelocation({
        confirmed: true,
        previewId: preview.previewId,
      })
      onCompleted(template.id, result)
      onOpenChange(false)
    } catch (caught) {
      setPreview(null)
      setError(t(errorMessage(caught)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root onOpenChange={value => !busy && onOpenChange(value)} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[3px]" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 flex w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8">
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <FilePenLine aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">{t('重命名或移动模板')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('只允许移动到当前工作区内；确认前不会写入文件。')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label={t('关闭模板移动窗口')}
                className="ml-auto"
                disabled={busy}
                size="close"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </header>

          <div className="p-5">
            {error && (
              <div
                className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label className="text-xs font-semibold" htmlFor="template-relocation-path">
              {t('新的文件名与相对路径')}
            </label>
            <input
              autoFocus
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-ring"
              disabled={busy}
              id="template-relocation-path"
              maxLength={4096}
              onChange={event => {
                setTargetRelativePath(event.target.value)
                setPreview(null)
              }}
              value={targetRelativePath}
            />
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {t('使用工作区内相对路径，并保留原源码扩展名；不会覆盖同名文件。')}
            </p>

            {preview && (
              <section className="mt-5 rounded-2xl border border-primary/18 bg-primary/5 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">{t('移动预览')}</h3>
                  <Badge className="ml-auto" tone="accent">
                    {t(
                      preview.changeKind === 'rename'
                        ? '仅重命名'
                        : preview.changeKind === 'move'
                          ? '仅移动'
                          : '重命名并移动',
                    )}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2 rounded-xl border border-border bg-background/70 p-3 font-mono text-xs">
                  <span className="break-all text-red-600 dark:text-red-300">
                    − {preview.sourceRelativePath}
                  </span>
                  <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <span className="break-all text-success">+ {preview.targetRelativePath}</span>
                </div>
                <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background/55 p-3">
                    <dt className="text-muted-foreground">{t('题目关联')}</dt>
                    <dd className="mt-1 font-semibold">
                      {preview.affectedRelationCount} {t('项保持原模板 ID')}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border bg-background/55 p-3">
                    <dt className="text-muted-foreground">{t('算法元数据')}</dt>
                    <dd className="mt-1 font-semibold">
                      {t(preview.affectedMetadata ? '保持不变' : '当前无元数据')}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                  {t('执行前会创建安全备份；文件、索引或数据库任一步失败都会恢复原路径。')}
                </p>
              </section>
            )}
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
            <p className="text-[11px] text-muted-foreground">
              {preview ? t('请核对原路径、新路径和受影响数据。') : t('先生成只读预览。')}
            </p>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button disabled={busy} type="button" variant="outline">
                  {t('取消')}
                </Button>
              </Dialog.Close>
              {preview ? (
                <Button disabled={busy} onClick={() => void apply()} type="button">
                  {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                  {t('确认重命名或移动')}
                </Button>
              ) : (
                <Button
                  disabled={
                    busy ||
                    !targetRelativePath.trim() ||
                    targetRelativePath.trim() === template.relativePath
                  }
                  onClick={() => void loadPreview()}
                  type="button"
                >
                  {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                  {t('预览变更')}
                </Button>
              )}
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
