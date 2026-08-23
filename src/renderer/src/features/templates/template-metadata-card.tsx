import { AlertCircle, Check, Edit3, Info, LoaderCircle, Save, Sparkles, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import type { TemplateMetadataFields } from '@core/contracts/template-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { useTemplateMetadata } from './use-template-metadata'

const emptyFields: TemplateMetadataFields = {
  commonMistakes: '',
  constraints: '',
  notes: '',
  prerequisites: '',
  solves: '',
  spaceComplexity: null,
  tags: [],
  timeComplexity: null,
}

export function TemplateMetadataCard({
  onCompleteWithAi,
  refreshKey,
  templateId,
}: {
  onCompleteWithAi: () => void
  refreshKey: number
  templateId: string
}) {
  const { t } = useI18n()
  const state = useTemplateMetadata(templateId, refreshKey)
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState<TemplateMetadataFields>(emptyFields)
  const [tagsText, setTagsText] = useState('')

  useEffect(() => {
    const value = state.metadata ?? emptyFields
    setFields({
      commonMistakes: value.commonMistakes,
      constraints: value.constraints,
      notes: value.notes,
      prerequisites: value.prerequisites,
      solves: value.solves,
      spaceComplexity: value.spaceComplexity,
      tags: value.tags,
      timeComplexity: value.timeComplexity,
    })
    setTagsText(value.tags.join(', '))
  }, [state.metadata, templateId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const tags = [
      ...new Set(
        tagsText
          .split(/[,，]/)
          .map(tag => tag.trim())
          .filter(Boolean),
      ),
    ]
    if (await state.update({ ...fields, tags, templateId })) setEditing(false)
  }

  if (state.isLoading) {
    return (
      <section className="mt-4 grid min-h-24 place-items-center rounded-xl border border-border bg-panel">
        <LoaderCircle className="size-4 animate-spin text-primary" />
      </section>
    )
  }

  const inputClass =
    'mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring'

  return (
    <section className="mt-4 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <Info className="size-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold">{t('算法信息')}</h2>
        {state.metadata && <Badge className="ml-1">{t('已维护')}</Badge>}
        <Button
          className="ml-auto"
          disabled={state.isBusy}
          onClick={onCompleteWithAi}
          size="compact"
          type="button"
          variant="outline"
        >
          <Sparkles className="size-3.5" />
          {t('AI 补全空白字段')}
        </Button>
        <Button
          onClick={() => setEditing(value => !value)}
          size="compact"
          type="button"
          variant="ghost"
        >
          {editing ? <X className="size-3.5" /> : <Edit3 className="size-3.5" />}
          {t(editing ? '取消编辑' : state.metadata ? '编辑' : '补充元数据')}
        </Button>
      </div>

      {state.error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="size-3.5" />
          {t(state.error)}
        </div>
      )}

      {editing ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => void submit(event)}>
          <label className="text-[11px] font-medium">
            {t('时间复杂度')}
            <input
              aria-label={t('模板时间复杂度')}
              className={inputClass}
              onChange={event =>
                setFields(current => ({
                  ...current,
                  timeComplexity: event.target.value.trim() || null,
                }))
              }
              value={fields.timeComplexity ?? ''}
            />
          </label>
          <label className="text-[11px] font-medium">
            {t('空间复杂度')}
            <input
              aria-label={t('模板空间复杂度')}
              className={inputClass}
              onChange={event =>
                setFields(current => ({
                  ...current,
                  spaceComplexity: event.target.value.trim() || null,
                }))
              }
              value={fields.spaceComplexity ?? ''}
            />
          </label>
          <label className="text-[11px] font-medium sm:col-span-2">
            {t('标签')}
            <input
              aria-label={t('模板标签')}
              className={inputClass}
              onChange={event => setTagsText(event.target.value)}
              value={tagsText}
            />
          </label>
          {(
            [
              ['solves', '解决的问题'],
              ['constraints', '适用约束'],
              ['prerequisites', '前置条件'],
              ['commonMistakes', '常见错误'],
              ['notes', '用户笔记'],
            ] as const
          ).map(([key, label]) => (
            <label className="text-[11px] font-medium sm:col-span-2" key={key}>
              {t(label)}
              <textarea
                aria-label={`${t('模板')}${t(label)}`}
                className="mt-1.5 min-h-16 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5 outline-none focus:ring-2 focus:ring-ring"
                onChange={event =>
                  setFields(current => ({ ...current, [key]: event.target.value }))
                }
                value={fields[key]}
              />
            </label>
          ))}
          <Button
            className="sm:col-span-2 sm:justify-self-end"
            disabled={state.isBusy}
            size="compact"
            type="submit"
          >
            {state.isBusy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {t('保存元数据')}
          </Button>
        </form>
      ) : state.metadata ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <p className="text-[10px] text-muted-foreground">{t('复杂度')}</p>
            <p className="mt-1 text-xs font-medium">
              {state.metadata.timeComplexity ?? t('未填写')} ·{' '}
              {state.metadata.spaceComplexity ?? t('未填写')}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <p className="text-[10px] text-muted-foreground">{t('标签')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {state.metadata.tags.length ? (
                state.metadata.tags.map(tag => <Badge key={tag}>{tag}</Badge>)
              ) : (
                <span className="text-xs">{t('未填写')}</span>
              )}
            </div>
          </div>
          {(
            [
              ['解决的问题', state.metadata.solves],
              ['适用约束', state.metadata.constraints],
              ['前置条件', state.metadata.prerequisites],
              ['常见错误', state.metadata.commonMistakes],
              ['用户笔记', state.metadata.notes],
            ] satisfies Array<[string, string | null | undefined]>
          ).map(([label, value]) => (
            <div
              className="rounded-lg border border-border bg-muted/25 p-3 sm:col-span-2"
              key={label}
            >
              <p className="text-[10px] text-muted-foreground">{t(label)}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{value || t('未填写')}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <Check className="size-3.5" />
          {t('源码可直接使用；元数据是可选增强，不影响离线查询。')}
        </p>
      )}
    </section>
  )
}
