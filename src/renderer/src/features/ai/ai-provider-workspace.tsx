import { LoaderCircle, Plus, ServerCog } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type {
  AiProviderCapabilities,
  AiProviderProfile,
  AiProviderProtocol,
  CreateAiProviderRequest,
} from '@core/contracts/ai-provider'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResizableLayout } from '@/components/resizable-layout'
import { layoutPreferenceKeys } from '@/hooks/use-layout-preference'
import { useI18n } from '@/lib/i18n'

import { AiProviderEditor } from './ai-provider-editor'
import {
  emptyAiProviderForm,
  parseProviderCustomHeaders,
  profileToAiProviderForm,
  providerProtocolOptions,
} from './ai-provider-form'
import { AiProviderList } from './ai-provider-list'
import type { ProviderPreset, ProviderPresetId } from './provider-presets'
import { useAiProviders } from './use-ai-providers'

export function AiProviderWorkspace() {
  const { t } = useI18n()
  const providerState = useAiProviders()
  const [deletePending, setDeletePending] = useState(false)
  const [form, setForm] = useState(emptyAiProviderForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(true)
  const [selectedPresetId, setSelectedPresetId] = useState<ProviderPresetId | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const selectedProfile = useMemo(
    () => providerState.profiles.find(profile => profile.id === selectedId) ?? null,
    [providerState.profiles, selectedId],
  )

  useEffect(() => {
    if (!selectedId && providerState.profiles[0] && !isCreating) {
      setSelectedId(providerState.profiles[0].id)
    }
  }, [isCreating, providerState.profiles, selectedId])

  const selectProfile = (profile: AiProviderProfile) => {
    setSelectedId(profile.id)
    setForm(profileToAiProviderForm(profile))
    setIsCreating(false)
    setSelectedPresetId(null)
    setDeletePending(false)
    setFormError(null)
    setSuccess(null)
    providerState.clearError()
  }

  const startCreating = () => {
    setSelectedId(null)
    setForm(emptyAiProviderForm)
    setIsCreating(true)
    setSelectedPresetId(null)
    setDeletePending(false)
    setFormError(null)
    setSuccess(null)
    providerState.clearError()
  }

  const applyPreset = (preset: ProviderPreset) => {
    setSelectedId(null)
    setForm({
      apiKey: '',
      baseUrl: preset.baseUrl,
      capabilities: { ...preset.capabilities },
      customHeadersText: '{}',
      model: preset.model,
      name: t(preset.name),
      protocol: preset.protocol,
      timeoutSeconds: preset.timeoutSeconds,
    })
    setIsCreating(true)
    setSelectedPresetId(preset.id)
    setDeletePending(false)
    setFormError(null)
    setSuccess(null)
    providerState.clearError()
  }

  const updateCapability = (key: keyof AiProviderCapabilities, checked: boolean) => {
    setForm(current => ({
      ...current,
      capabilities: { ...current.capabilities, [key]: checked },
    }))
  }

  const updateProtocol = (protocol: AiProviderProtocol) => {
    const option = providerProtocolOptions.find(item => item.value === protocol)!
    setSelectedPresetId(null)
    setForm(current => ({ ...current, baseUrl: option.defaultBaseUrl, protocol }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSuccess(null)
    let customHeaders: Record<string, string>
    try {
      customHeaders = parseProviderCustomHeaders(form.customHeadersText)
    } catch (error) {
      setFormError(error instanceof Error ? t(error.message) : t('自定义请求头格式无效。'))
      return
    }
    const timeoutMs = Math.round(Number(form.timeoutSeconds) * 1000)
    if (!Number.isFinite(timeoutMs)) {
      setFormError(t('超时时间必须是数字。'))
      return
    }
    const request: CreateAiProviderRequest = {
      apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl,
      capabilities: form.capabilities,
      customHeaders,
      model: form.model,
      name: form.name,
      protocol: form.protocol,
      timeoutMs,
    }
    const saved = isCreating
      ? await providerState.create(request)
      : selectedProfile
        ? await providerState.update({ ...request, clearApiKey: false, id: selectedProfile.id })
        : null
    if (saved) {
      setSelectedId(saved.id)
      setForm(profileToAiProviderForm(saved))
      setIsCreating(false)
      setSuccess(t(isCreating ? 'Provider 已安全保存。' : 'Provider 配置已更新。'))
    }
  }

  const testConnection = async () => {
    if (!selectedProfile) return
    setSuccess(null)
    const result = await providerState.testConnection(selectedProfile.id)
    if (result)
      setSuccess(
        t('{message} 延迟 {latency} ms。', {
          latency: result.latencyMs,
          message: t(result.message),
        }),
      )
  }

  const deleteProfile = async () => {
    if (!selectedProfile) return
    const deleted = await providerState.deleteProfile(selectedProfile.id)
    if (deleted) startCreating()
  }

  if (providerState.isLoading) {
    return (
      <main className="grid h-full min-h-0 place-items-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium">{t('正在读取 AI Provider…')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b border-primary/16 px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/11 text-primary ring-1 ring-primary/12">
          <ServerCog aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">{t('AI 设置')}</h1>
            <Badge tone="accent">
              {providerState.profiles.length} {t('个配置')}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('只负责供应商、密钥、模型能力与任务路由；不会在此执行 AI 管理任务')}
          </p>
        </div>
        <Button className="ml-auto" onClick={startCreating} size="compact" type="button">
          <Plus className="size-3.5" />
          {t('添加 Provider')}
        </Button>
      </header>

      <ResizableLayout
        className="min-h-0 flex-1"
        defaultPrimarySize={284}
        maximumPrimarySize={420}
        minimumPrimarySize={220}
        minimumSecondarySize={360}
        primaryLabel={t('Provider 列表面板')}
        secondaryLabel={t('Provider 详情面板')}
        separatorLabel={t('调整 Provider 列表宽度')}
        storageKey={layoutPreferenceKeys.aiProviderWorkspace}
        valueText={size => t('Provider 列表宽度 {size} 像素', { size })}
      >
        <AiProviderList
          onSelect={selectProfile}
          profiles={providerState.profiles}
          selectedId={selectedId}
        />
        <AiProviderEditor
          deletePending={deletePending}
          form={form}
          formError={formError}
          isBusy={providerState.isBusy}
          isCreating={isCreating}
          onApplyPreset={applyPreset}
          onCapabilityChange={updateCapability}
          onDelete={() => void deleteProfile()}
          onDeletePendingChange={setDeletePending}
          onDismissNotice={() => {
            setSuccess(null)
            setFormError(null)
            providerState.clearError()
          }}
          onFormChange={setForm}
          onProtocolChange={updateProtocol}
          onRoute={task => {
            if (selectedProfile) {
              void providerState.upsertRoute({ providerId: selectedProfile.id, task })
            }
          }}
          onSubmit={event => void submit(event)}
          onTestConnection={() => void testConnection()}
          providerError={providerState.error}
          routes={providerState.routes}
          selectedPresetId={selectedPresetId}
          selectedProfile={selectedProfile}
          success={success}
        />
      </ResizableLayout>
    </main>
  )
}
