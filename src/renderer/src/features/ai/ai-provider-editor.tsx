import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  LoaderCircle,
  Trash2,
  Wifi,
  Zap,
  X,
} from 'lucide-react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'

import type {
  AiProviderCapabilities,
  AiProviderProfile,
  AiProviderProtocol,
  AiTaskKind,
  AiTaskRoute,
} from '@core/contracts/ai-provider'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import {
  providerProtocolLabel,
  providerProtocolOptions,
  type AiProviderFormState,
} from './ai-provider-form'
import {
  getProviderPreset,
  providerPresets,
  type ProviderPreset,
  type ProviderPresetId,
} from './provider-presets'

const taskOptions: Array<{ label: string; requiresVision?: boolean; value: AiTaskKind }> = [
  { label: '题目图片分析', requiresVision: true, value: 'problem-image-analysis' },
  { label: '模板元数据补全', value: 'template-metadata' },
  { label: '总体文件 AI 管理', value: 'workspace-management' },
]

interface AiProviderEditorProps {
  deletePending: boolean
  form: AiProviderFormState
  formError: string | null
  isBusy: boolean
  isCreating: boolean
  onApplyPreset: (preset: ProviderPreset) => void
  onCapabilityChange: (key: keyof AiProviderCapabilities, checked: boolean) => void
  onDelete: () => void
  onDeletePendingChange: (pending: boolean) => void
  onDismissNotice: () => void
  onFormChange: Dispatch<SetStateAction<AiProviderFormState>>
  onProtocolChange: (protocol: AiProviderProtocol) => void
  onRoute: (task: AiTaskKind) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTestConnection: () => void
  providerError: string | null
  routes: AiTaskRoute[]
  selectedPresetId: ProviderPresetId | null
  selectedProfile: AiProviderProfile | null
  success: string | null
}

export function AiProviderEditor({
  deletePending,
  form,
  formError,
  isBusy,
  isCreating,
  onApplyPreset,
  onCapabilityChange,
  onDelete,
  onDeletePendingChange,
  onDismissNotice,
  onFormChange,
  onProtocolChange,
  onRoute,
  onSubmit,
  onTestConnection,
  providerError,
  routes,
  selectedPresetId,
  selectedProfile,
  success,
}: AiProviderEditorProps) {
  const { t } = useI18n()

  return (
    <section className="relative min-h-0 overflow-y-auto bg-background/75">
      <div
        aria-hidden="true"
        className="app-grid-texture pointer-events-none absolute inset-x-0 top-0 h-72 opacity-35"
      />
      <form className="relative mx-auto max-w-4xl p-6" onSubmit={onSubmit}>
        <div className="relative flex flex-wrap items-start justify-between gap-4 overflow-hidden rounded-2xl border border-primary/15 bg-panel p-5 shadow-focus">
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-20 size-56 rounded-full bg-primary/9 blur-3xl"
          />
          <div className="relative">
            <p className="text-xs font-medium text-primary">
              {t(isCreating ? '新配置' : '配置详情')}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {isCreating ? t('连接一个 AI 服务') : selectedProfile?.name}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              {t('Provider 只声明连接方式与能力。题目分析和文件管理将在任务路由确认后使用它。')}
            </p>
          </div>
          {!isCreating && selectedProfile && (
            <div className="relative flex items-center gap-2">
              <Badge tone={selectedProfile.hasSecret ? 'success' : 'neutral'}>
                <KeyRound className="size-3" />
                {t(selectedProfile.hasSecret ? '密钥已保存' : '无密钥')}
              </Badge>
              <Button
                disabled={isBusy}
                onClick={onTestConnection}
                size="compact"
                type="button"
                variant="outline"
              >
                <Wifi className="size-3.5" />
                {t('测试连接')}
              </Button>
            </div>
          )}
        </div>

        {(formError || providerError || success) && (
          <div
            className={cn(
              'mt-5 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs',
              success
                ? 'border-success/25 bg-success/8 text-foreground'
                : 'border-red-500/25 bg-red-500/5 text-red-700 dark:text-red-300',
            )}
            role={success ? 'status' : 'alert'}
          >
            {success ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{t(success ?? formError ?? providerError ?? '')}</span>
            <button
              aria-label={t('关闭 AI 提示')}
              className="ml-auto rounded p-0.5 hover:bg-muted"
              onClick={onDismissNotice}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {isCreating && (
          <section aria-label={t('供应商快捷预设')} className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{t('供应商快捷预设')}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('自动填写官方兼容协议和推荐模型，保存前仍可修改。')}
                </p>
              </div>
              <Badge tone="neutral">{t('API Key 仍由你填写')}</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {providerPresets.map(preset => {
                const selected = selectedPresetId === preset.id
                const Icon = preset.id === 'deepseek' ? Zap : Cloud
                return (
                  <button
                    aria-label={`${t('使用预设')} ${t(preset.name)}`}
                    aria-pressed={selected}
                    className={cn(
                      'interactive-lift group rounded-2xl border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary/35 bg-primary/9 shadow-panel'
                        : 'border-border bg-panel shadow-xs hover:border-primary/25 hover:bg-surface-subtle',
                    )}
                    key={preset.id}
                    onClick={() => onApplyPreset(preset)}
                    type="button"
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-xl',
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          {t(preset.name)}
                          {selected && <CheckCircle2 className="size-3.5 text-primary" />}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {t(preset.description)}
                        </span>
                        <span className="mt-2 block font-mono text-[11px] text-primary">
                          {preset.model}
                        </span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <div className="mt-6 grid gap-5 rounded-2xl border border-border bg-panel p-5 shadow-panel md:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">
            {t('显示名称')}
            <input
              aria-label={t('Provider 显示名称')}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              maxLength={80}
              onChange={event =>
                onFormChange(current => ({ ...current, name: event.target.value }))
              }
              placeholder={t('例如：我的 OpenAI')}
              required
              value={form.name}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            {t('协议')}
            <select
              aria-label={t('Provider 协议')}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              onChange={event => onProtocolChange(event.target.value as AiProviderProtocol)}
              value={form.protocol}
            >
              {providerProtocolOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium md:col-span-2">
            Base URL
            <input
              aria-label="Base URL"
              className="h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              onChange={event =>
                onFormChange(current => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder={
                selectedPresetId
                  ? getProviderPreset(selectedPresetId).baseUrlPlaceholder
                  : undefined
              }
              required
              spellCheck={false}
              value={form.baseUrl}
            />
            <span className="font-normal text-muted-foreground">
              {selectedPresetId === 'aliyun-bailian'
                ? t('已填入阿里云北京区域兼容端点；如控制台配置不同，请按实际端点调整。')
                : t('云端服务必须使用 HTTPS；Ollama 可连接 localhost。')}
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            {t('模型名称')}
            <input
              aria-label={t('模型名称')}
              className="h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              maxLength={160}
              onChange={event =>
                onFormChange(current => ({ ...current, model: event.target.value }))
              }
              placeholder={t('精确填写服务商模型 ID')}
              required
              value={form.model}
            />
            {selectedPresetId && (
              <span className="font-normal text-muted-foreground">
                {t(getProviderPreset(selectedPresetId).modelHint)}
              </span>
            )}
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            {t('超时时间（秒）')}
            <input
              aria-label={t('超时时间')}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              max="120"
              min="3"
              onChange={event =>
                onFormChange(current => ({ ...current, timeoutSeconds: event.target.value }))
              }
              required
              type="number"
              value={form.timeoutSeconds}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium md:col-span-2">
            API Key {selectedProfile?.hasSecret && t('（留空则保留现有密钥）')}
            <input
              aria-label="API Key"
              autoComplete="off"
              className="h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              onChange={event =>
                onFormChange(current => ({ ...current, apiKey: event.target.value }))
              }
              placeholder={
                form.protocol === 'ollama-chat'
                  ? t('本机 Ollama 通常无需填写')
                  : t('仅写入系统安全存储')
              }
              type="password"
              value={form.apiKey}
            />
          </label>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
            <h3 className="text-sm font-semibold">{t('模型能力')}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('按实际模型能力声明，任务路由会在调用前检查。')}
            </p>
            <div className="mt-4 space-y-3">
              {(
                [
                  ['vision', '视觉输入'],
                  ['structuredOutput', '结构化输出'],
                  ['promptCaching', 'Prompt 缓存'],
                  ['streaming', '流式输出'],
                ] as const
              ).map(([key, label]) => (
                <label className="flex items-center gap-2.5 text-xs" key={key}>
                  <input
                    checked={form.capabilities[key]}
                    className="size-4 accent-primary"
                    onChange={event => onCapabilityChange(key, event.target.checked)}
                    type="checkbox"
                  />
                  {t(label)}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
            <h3 className="text-sm font-semibold">{t('自定义请求头')}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('使用 JSON 对象；鉴权与传输敏感头由应用管理，不能覆盖。')}
            </p>
            <textarea
              aria-label={t('自定义请求头')}
              className="mt-3 min-h-28 w-full resize-y rounded-xl border border-input bg-background p-3 font-mono text-xs outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring"
              onChange={event =>
                onFormChange(current => ({ ...current, customHeadersText: event.target.value }))
              }
              spellCheck={false}
              value={form.customHeadersText}
            />
          </section>
        </div>

        {!isCreating && selectedProfile && (
          <section className="mt-5 rounded-2xl border border-primary/15 bg-panel p-5 shadow-panel">
            <h3 className="text-sm font-semibold">{t('任务路由')}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('工作台任务指向此 Provider；题图分析只接受视觉模型。')}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {taskOptions.map(task => {
                const active = routes.some(
                  route => route.task === task.value && route.providerId === selectedProfile.id,
                )
                const disabled = task.requiresVision && !selectedProfile.capabilities.vision
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'border-primary/35 bg-primary/8' : 'border-border hover:bg-muted/50',
                      disabled && 'cursor-not-allowed opacity-50',
                    )}
                    disabled={disabled || isBusy}
                    key={task.value}
                    onClick={() => onRoute(task.value)}
                    type="button"
                  >
                    <span className="block text-xs font-medium">{t(task.label)}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {t(active ? '当前路由' : disabled ? '需要视觉能力' : '设为当前路由')}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button disabled={isBusy} type="submit">
            {isBusy && <LoaderCircle className="size-4 animate-spin" />}
            {t(isCreating ? '保存 Provider' : '保存更改')}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {t('当前协议')}：{providerProtocolLabel(form.protocol)}
          </span>
          {!isCreating && selectedProfile && (
            <div className="ml-auto flex items-center gap-2">
              {deletePending ? (
                <>
                  <span className="text-xs text-red-600 dark:text-red-300">
                    {t('删除后任务路由也会移除')}
                  </span>
                  <Button
                    className="border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-300"
                    disabled={isBusy}
                    onClick={onDelete}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    {t('确认删除')}
                  </Button>
                  <Button
                    onClick={() => onDeletePendingChange(false)}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {t('取消')}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => onDeletePendingChange(true)}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />
                  {t('删除配置')}
                </Button>
              )}
            </div>
          )}
        </div>
      </form>
    </section>
  )
}
