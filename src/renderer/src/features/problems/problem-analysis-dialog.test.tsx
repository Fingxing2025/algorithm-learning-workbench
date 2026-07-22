import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ProblemAnalysisCandidate,
  ProblemAnalysisDraft,
} from '@core/contracts/problem-analysis'
import type { AiRequestPreview } from '@core/contracts/ai-request'
import type { CreateProblemRequest, Problem } from '@core/contracts/problem'
import type { TemplatePage, TemplateSummary } from '@core/contracts/workspace'

import { ProblemAnalysisDialog } from './problem-analysis-dialog'

const requestId = '11111111-1111-4111-8111-111111111111'
const templateId = 'a'.repeat(64)

const template: TemplateSummary = {
  extension: '.cpp',
  fileName: 'dijkstra.cpp',
  id: templateId,
  language: 'C++',
  modifiedAt: '2026-07-19T00:00:00.000Z',
  name: 'Dijkstra',
  relativePath: '图论/最短路/dijkstra.cpp',
  sizeBytes: 1024,
}

const templatePage: TemplatePage = {
  items: [template],
  nextAction: null,
  nextCursor: null,
  processedCount: 1,
  totalCount: 1,
  truncated: false,
  truncatedReason: null,
}

const emptyAnalysis: CreateProblemRequest['analysis'] = {
  algorithmSignals: [],
  constraints: [],
  edgeCases: [],
  examples: [],
  inputDescription: '',
  outputDescription: '',
}

const preview: AiRequestPreview = {
  cache: {
    eligible: true,
    key: 'problem-analysis-fixture',
    workspaceContextVersion: 'fixture-v1',
  },
  capabilities: {
    promptCaching: true,
    streaming: true,
    structuredOutput: true,
    vision: true,
  },
  endpointHost: 'api.example.com',
  estimatedInputTokens: 128,
  items: [{ detail: '仅发送当前题面。', kind: 'content', label: '题面文本' }],
  model: 'fixture-model',
  outputLanguage: 'zh-CN',
  protocol: 'openai-responses',
  providerName: 'Fixture AI',
  task: 'problem-image-analysis',
  truncated: false,
  workspaceCatalog: {
    directoryCount: 12,
    estimatedInputTokens: 96,
    relatedSourceCharacters: 4_096,
    relatedSourceTemplateCount: 3,
    schemaVersion: 1,
    sentTemplateNameCount: 300,
    sourceSnippetsOmitted: false,
    summarizedTemplateCount: 288,
    summaryShortened: true,
    supplementalMetadataOmitted: false,
    templateCount: 300,
    templateNamesTruncated: false,
  },
}

const candidate: ProblemAnalysisCandidate = {
  applicableWhen: ['非负边权'],
  confidence: 0.9,
  evidence: ['最短路'],
  matchedCapabilities: ['单源最短路'],
  notApplicableWhen: ['存在负权边'],
  reason: '题目要求非负边权图上的单源最短路。',
  relationType: 'recommended',
  role: 'direct-solution',
  templateId,
  templateName: template.name,
  templatePath: template.relativePath,
  warnings: [],
}

const generatedFields: CreateProblemRequest = {
  aiSummary: '使用 Dijkstra 求单源最短路。',
  analysis: {
    ...emptyAnalysis,
    algorithmSignals: ['最短路', '非负边权'],
    constraints: ['n <= 100000'],
    inputDescription: '输入图与起点。',
    outputDescription: '输出最短距离。',
  },
  difficulty: '提高',
  notes: '注意使用 long long。',
  platform: '洛谷',
  problemCode: 'P4779',
  statement: '模型不应覆盖用户保留的原始题面。',
  status: 'solved',
  tags: ['最短路', '图论'],
  title: 'AI 标题',
  url: 'https://www.luogu.com.cn/problem/P4779',
}

const draft: ProblemAnalysisDraft = {
  candidates: [candidate],
  fields: generatedFields,
  model: preview.model,
  providerName: preview.providerName,
}

const createdProblem: Problem = {
  ...generatedFields,
  createdAt: '2026-07-19T01:00:00.000Z',
  id: '22222222-2222-4222-8222-222222222222',
  images: [],
  relations: [],
  updatedAt: '2026-07-19T01:00:00.000Z',
}

function installDesktopMock({
  analyzeResult = draft,
}: { analyzeResult?: ProblemAnalysisDraft } = {}) {
  const analyze = vi.fn().mockResolvedValue(analyzeResult)
  const cancel = vi.fn().mockResolvedValue(undefined)
  const commit = vi.fn().mockResolvedValue(createdProblem)
  const previewRequest = vi.fn().mockResolvedValue(preview)

  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      problemAnalysis: {
        analyze,
        cancel,
        chooseImages: vi.fn().mockResolvedValue([]),
        commit,
        preview: previewRequest,
      },
    },
  })

  return { analyze, cancel, commit, preview: previewRequest }
}

function renderDialog() {
  const onCreated = vi.fn()
  const onOpenChange = vi.fn()
  const onSearchTemplates = vi.fn().mockResolvedValue(templatePage)

  render(
    <ProblemAnalysisDialog
      onCreated={onCreated}
      onOpenChange={onOpenChange}
      onSearchTemplates={onSearchTemplates}
      open
      templates={[template]}
    />,
  )

  return { onCreated, onOpenChange, onSearchTemplates }
}

describe('ProblemAnalysisDialog', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(requestId)
  })

  it('commits one manual draft with deduplicated tags and the selected relation', async () => {
    const desktop = installDesktopMock()
    const callbacks = renderDialog()

    fireEvent.change(await screen.findByLabelText('题目标题'), {
      target: { value: '手动记录的最短路' },
    })
    fireEvent.change(screen.getByLabelText('标签'), {
      target: { value: '图论, 最短路，图论' },
    })
    fireEvent.change(screen.getByLabelText('选择本地模板'), {
      target: { value: templateId },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加本地模板关联' }))
    fireEvent.change(screen.getByLabelText(`${template.name} 关系类型`), {
      target: { value: 'alternative' },
    })
    fireEvent.change(screen.getByLabelText(`${template.name} 关联备注`), {
      target: { value: '保留作备选实现' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建题目' }))

    await waitFor(() =>
      expect(desktop.commit).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          tags: ['图论', '最短路'],
          title: '手动记录的最短路',
        }),
        images: [],
        relations: [
          {
            note: '保留作备选实现',
            relationType: 'alternative',
            templateId,
          },
        ],
      }),
    )
    expect(callbacks.onCreated).toHaveBeenCalledWith(createdProblem)
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('previews before analysis, preserves user fields, and commits selected AI candidates', async () => {
    const desktop = installDesktopMock()
    renderDialog()

    fireEvent.change(await screen.findByLabelText('题目标题'), {
      target: { value: '用户保留标题' },
    })
    fireEvent.change(screen.getByLabelText('原始题面'), {
      target: { value: '用户保留题面' },
    })
    fireEvent.change(screen.getByLabelText('标签'), {
      target: { value: '手工标签' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'AI 分析并补全' }))

    await waitFor(() =>
      expect(desktop.preview).toHaveBeenCalledWith({
        images: [],
        outputLanguage: 'zh-CN',
        text: '用户保留题面',
      }),
    )
    expect(await screen.findByLabelText('完整工作区目录覆盖')).toHaveTextContent('300 / 300')
    expect(screen.getByLabelText('完整工作区目录覆盖')).toHaveTextContent(
      '模板名称完整，无不可接受裁剪。',
    )
    fireEvent.click(await screen.findByRole('button', { name: '确认发送并生成' }))

    await waitFor(() =>
      expect(desktop.analyze).toHaveBeenCalledWith({
        images: [],
        outputLanguage: 'zh-CN',
        requestId,
        text: '用户保留题面',
      }),
    )
    expect(await screen.findByDisplayValue('用户保留标题')).toBeInTheDocument()
    expect(screen.getByDisplayValue('用户保留题面')).toBeInTheDocument()
    expect(screen.getByLabelText(`选择候选模板 ${template.name}`)).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '创建题目' }))

    await waitFor(() =>
      expect(desktop.commit).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          aiSummary: generatedFields.aiSummary,
          analysis: generatedFields.analysis,
          statement: '用户保留题面',
          tags: ['手工标签', '最短路', '图论'],
          title: '用户保留标题',
        }),
        images: [],
        relations: [
          {
            note: candidate.reason,
            relationType: candidate.relationType,
            templateId,
          },
        ],
      }),
    )
  })

  it('cancels the active desktop request before closing a busy dialog', async () => {
    const desktop = installDesktopMock()
    desktop.analyze.mockImplementation(() => new Promise(() => undefined))
    const callbacks = renderDialog()

    fireEvent.change(await screen.findByLabelText('原始题面'), {
      target: { value: '等待取消的题面' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'AI 分析并补全' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认发送并生成' }))
    await waitFor(() => expect(desktop.analyze).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '关闭 AI 发送预览' }))

    expect(desktop.cancel).toHaveBeenCalledWith(requestId)
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false)
    expect(desktop.commit).not.toHaveBeenCalled()
  })
})
