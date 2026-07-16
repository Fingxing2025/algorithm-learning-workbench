import { cpp } from '@codemirror/lang-cpp'
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import hljs from 'highlight.js/lib/core'
import c from 'highlight.js/lib/languages/c'
import csharp from 'highlight.js/lib/languages/csharp'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import kotlin from 'highlight.js/lib/languages/kotlin'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import { Braces, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

import { cppCodeVisuals } from './cpp-code-visuals'

const CODE_THEME_STORAGE_KEY = 'ui:code-theme'

const codeThemes = [
  { label: '跟随应用', value: 'system' },
  { label: 'VS Code Light+', value: 'vscode-light' },
  { label: 'VS Code Dark+', value: 'vscode-dark' },
  { label: 'Monokai', value: 'monokai' },
] as const

type CodeTheme = (typeof codeThemes)[number]['value']
type ResolvedCodeTheme = Exclude<CodeTheme, 'system'>

const languages = {
  c,
  csharp,
  go,
  java,
  javascript,
  kotlin,
  php,
  python,
  ruby,
  rust,
  swift,
  typescript,
}

for (const [name, definition] of Object.entries(languages)) {
  hljs.registerLanguage(name, definition)
}

const languageAliases: Record<string, keyof typeof languages> = {
  'C#': 'csharp',
  Go: 'go',
  Java: 'java',
  JavaScript: 'javascript',
  Kotlin: 'kotlin',
  PHP: 'php',
  Python: 'python',
  Ruby: 'ruby',
  Rust: 'rust',
  Swift: 'swift',
  TypeScript: 'typescript',
}

const cppLanguages = new Set(['C', 'C++', 'C/C++ Header'])

interface EditorPalette {
  activeLine: string
  background: string
  bracket: string
  bracketColors: readonly [string, string, string, string, string, string]
  comment: string
  constant: string
  foreground: string
  function: string
  gutter: string
  gutterForeground: string
  header: string
  indentGuide: string
  isDark: boolean
  keyword: string
  meta: string
  number: string
  operator: string
  primitiveType: string
  property: string
  selection: string
  string: string
  type: string
  variable: string
}

const editorPalettes: Record<ResolvedCodeTheme, EditorPalette> = {
  monokai: {
    activeLine: '#3e3d32',
    background: '#272822',
    bracket: '#49483e',
    bracketColors: ['#f8f8f2', '#f92672', '#66d9ef', '#a6e22e', '#fd971f', '#ae81ff'],
    comment: '#8f908a',
    constant: '#ae81ff',
    foreground: '#f8f8f2',
    function: '#a6e22e',
    gutter: '#272822',
    gutterForeground: '#90908a',
    header: '#e6db74',
    indentGuide: '#49483e',
    isDark: true,
    keyword: '#f92672',
    meta: '#f92672',
    number: '#ae81ff',
    operator: '#f92672',
    primitiveType: '#66d9ef',
    property: '#a6e22e',
    selection: '#49483e',
    string: '#e6db74',
    type: '#66d9ef',
    variable: '#a6e22e',
  },
  'vscode-dark': {
    activeLine: '#252526',
    background: '#1e1e1e',
    bracket: '#3a3d41',
    bracketColors: ['#ffd700', '#da70d6', '#179fff', '#ffd700', '#da70d6', '#179fff'],
    comment: '#6a9955',
    constant: '#4fc1ff',
    foreground: '#d4d4d4',
    function: '#dcdcaa',
    gutter: '#1e1e1e',
    gutterForeground: '#858585',
    header: '#ce9178',
    indentGuide: '#404040',
    isDark: true,
    keyword: '#c586c0',
    meta: '#c586c0',
    number: '#b5cea8',
    operator: '#d4d4d4',
    primitiveType: '#569cd6',
    property: '#9cdcfe',
    selection: '#264f78',
    string: '#ce9178',
    type: '#4ec9b0',
    variable: '#9cdcfe',
  },
  'vscode-light': {
    activeLine: '#f0f6ff',
    background: '#ffffff',
    bracket: '#d0d7de',
    bracketColors: ['#9a6700', '#8250df', '#0969da', '#9a6700', '#8250df', '#0969da'],
    comment: '#008000',
    constant: '#0070c1',
    foreground: '#24292f',
    function: '#795e26',
    gutter: '#ffffff',
    gutterForeground: '#8c959f',
    header: '#a31515',
    indentGuide: '#d8dee4',
    isDark: false,
    keyword: '#af00db',
    meta: '#af00db',
    number: '#098658',
    operator: '#24292f',
    primitiveType: '#0000ff',
    property: '#001080',
    selection: '#b6d7ff',
    string: '#a31515',
    type: '#267f99',
    variable: '#001080',
  },
}

function getInitialCodeTheme(): CodeTheme {
  const stored = window.localStorage.getItem(CODE_THEME_STORAGE_KEY)
  return codeThemes.some(theme => theme.value === stored) ? (stored as CodeTheme) : 'system'
}

function useApplicationDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const root = document.documentElement
    const update = () => setIsDark(root.classList.contains('dark'))
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

function resolveCodeTheme(theme: CodeTheme, isApplicationDark: boolean): ResolvedCodeTheme {
  if (theme !== 'system') return theme
  return isApplicationDark ? 'vscode-dark' : 'vscode-light'
}

function createEditorTheme(theme: ResolvedCodeTheme) {
  const palette = editorPalettes[theme]

  return [
    EditorView.theme(
      {
        '&': {
          backgroundColor: palette.background,
          color: palette.foreground,
          height: '100%',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-activeLine': { backgroundColor: palette.activeLine },
        '.cm-activeLineGutter': { backgroundColor: palette.activeLine },
        '.cm-content': {
          caretColor: palette.foreground,
          fontFamily:
            "'SFMono-Regular', 'Cascadia Code', 'JetBrains Mono', 'Roboto Mono', Consolas, monospace",
          fontSize: '13px',
          lineHeight: '24px',
          minHeight: '100%',
          padding: '0 18px 72px 0',
        },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette.foreground },
        '.cm-gutters': {
          backgroundColor: palette.gutter,
          borderRight: `1px solid ${palette.bracket}`,
          color: palette.gutterForeground,
          minHeight: '100%',
          padding: '0 0 72px',
        },
        '.cm-line': { padding: '0 18px' },
        '.cm-line.cm-indent-guides': {
          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(var(--cm-indent-size) - 1px), ${palette.indentGuide} calc(var(--cm-indent-size) - 1px), ${palette.indentGuide} var(--cm-indent-size))`,
          backgroundPosition: '18px 0',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'calc(var(--cm-indent-level) * var(--cm-indent-size)) 100%',
        },
        '.cm-lineNumbers .cm-gutterElement': { minWidth: '36px', padding: '0 10px 0 8px' },
        '.cm-matchingBracket': {
          backgroundColor: palette.bracket,
          outline: `1px solid ${palette.gutterForeground}`,
        },
        '.cm-cpp-header': { color: palette.header },
        '.cm-cpp-primitive-type': { color: palette.primitiveType },
        ...Object.fromEntries(
          palette.bracketColors.map((color, index) => [
            `.cm-rainbow-bracket-${index}`,
            { color, fontWeight: '600' },
          ]),
        ),
        '.cm-scroller': {
          backgroundColor: palette.background,
          fontFamily: 'inherit',
          margin: '0',
          overflow: 'auto',
          padding: '0',
        },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: `${palette.selection} !important`,
        },
      },
      { dark: palette.isDark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: [tags.keyword, tags.controlKeyword], color: palette.keyword },
        { tag: [tags.definitionKeyword, tags.typeName, tags.className], color: palette.type },
        { tag: [tags.meta, tags.processingInstruction], color: palette.meta },
        { tag: [tags.string, tags.special(tags.string)], color: palette.string },
        { tag: [tags.number, tags.bool, tags.null], color: palette.number },
        { tag: [tags.namespace, tags.variableName], color: palette.variable },
        { tag: [tags.constant(tags.name), tags.macroName], color: palette.constant },
        { tag: tags.propertyName, color: palette.property },
        {
          tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
          color: palette.function,
        },
        { tag: [tags.operator, tags.operatorKeyword], color: palette.operator },
        { tag: [tags.comment, tags.lineComment, tags.blockComment], color: palette.comment },
      ]),
    ),
  ]
}

function CppCodeEditor({ source, theme }: { source: string; theme: ResolvedCodeTheme }) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return

    const editor = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: source,
        extensions: [
          cpp(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          drawSelection(),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          bracketMatching(),
          cppCodeVisuals,
          createEditorTheme(theme),
        ],
      }),
    })

    return () => editor.destroy()
  }, [source, theme])

  return (
    <div
      aria-label={t('高亮模板源码')}
      className="code-editor-surface min-h-0 flex-1 overflow-hidden"
      data-code-theme={theme}
      ref={hostRef}
      role="region"
      tabIndex={0}
    />
  )
}

function HighlightJsCode({
  language,
  source,
  theme,
}: {
  language: string
  source: string
  theme: CodeTheme
}) {
  const { t } = useI18n()
  const highlighted = useMemo(() => {
    const registeredLanguage = languageAliases[language]
    return registeredLanguage
      ? hljs.highlight(source, { ignoreIllegals: true, language: registeredLanguage }).value
      : hljs.highlightAuto(source).value
  }, [language, source])

  return (
    <pre
      aria-label={t('高亮模板源码')}
      className="code-surface min-h-0 flex-1 overflow-auto px-5 py-4 font-mono text-[13px] leading-6 selection:bg-[#264f78] selection:text-white"
      data-code-theme={theme}
      tabIndex={0}
    >
      <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  )
}

export function CodeViewer({ code, language }: { code: string; language: string }) {
  const { t } = useI18n()
  const [isExpanded, setIsExpanded] = useState(false)
  const [theme, setTheme] = useState<CodeTheme>(getInitialCodeTheme)
  const isApplicationDark = useApplicationDarkMode()
  const source = code || t('// 空模板文件')
  const lineCount = useMemo(() => source.split(/\r\n|\r|\n/).length, [source])
  const resolvedTheme = resolveCodeTheme(theme, isApplicationDark)
  const usesLightChrome = resolvedTheme === 'vscode-light'

  useEffect(() => {
    window.localStorage.setItem(CODE_THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!isExpanded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isExpanded])

  return (
    <>
      {isExpanded && <div aria-hidden="true" className="fixed inset-0 z-40 bg-overlay/70" />}
      <div
        aria-label={t('模板代码查看器')}
        className={cn(
          'relative flex h-[clamp(440px,62vh,720px)] min-h-[440px] shrink-0 flex-col overflow-hidden rounded-xl shadow-[0_12px_32px_-20px_rgba(15,23,42,0.7)]',
          usesLightChrome
            ? 'border border-[#d0d7de] bg-white ring-1 ring-black/5'
            : 'border border-black/15 bg-code ring-1 ring-white/5',
          isExpanded && 'fixed inset-4 z-50 h-auto min-h-0 rounded-2xl shadow-2xl',
        )}
        data-expanded={isExpanded ? 'true' : 'false'}
      >
        <div
          aria-label={t('代码查看器工具栏')}
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 border-b px-3.5',
            usesLightChrome
              ? 'border-[#d0d7de] bg-[#f6f8fa] text-[#24292f]'
              : 'border-white/10 bg-[#181818] text-code-foreground',
          )}
        >
          <span
            className={cn(
              'grid size-6 place-items-center rounded-md',
              usesLightChrome ? 'bg-[#eaeef2] text-[#0969da]' : 'bg-white/7 text-[#9cdcfe]',
            )}
          >
            <Braces aria-hidden="true" className="size-3.5" />
          </span>
          <span className="text-[11px] font-semibold">{language}</span>
          <span
            className={cn(
              'text-[10px]',
              usesLightChrome ? 'text-[#57606a]' : 'text-code-foreground/45',
            )}
          >
            {lineCount} {t('行')}
          </span>
          <label
            className={cn(
              'ml-auto flex items-center gap-2 text-[10px]',
              usesLightChrome ? 'text-[#57606a]' : 'text-code-foreground/60',
            )}
          >
            <span className="hidden sm:inline">{t('代码主题')}</span>
            <select
              aria-label={t('代码主题')}
              className={cn(
                'h-7 rounded-md border px-2.5 text-[10px] outline-none transition-colors focus:ring-2',
                usesLightChrome
                  ? 'border-[#d0d7de] bg-white text-[#24292f] hover:bg-[#f6f8fa] focus:ring-[#0969da]'
                  : 'border-white/12 bg-white/6 text-code-foreground hover:bg-white/10 focus:ring-[#007acc]',
              )}
              onChange={event => setTheme(event.target.value as CodeTheme)}
              value={theme}
            >
              {codeThemes.map(option => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label={t(isExpanded ? '退出代码专注模式' : '进入代码专注模式')}
            className={cn(
              'grid size-7 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2',
              usesLightChrome
                ? 'text-[#57606a] hover:bg-[#eaeef2] hover:text-[#24292f] focus-visible:ring-[#0969da]'
                : 'text-code-foreground/60 hover:bg-white/10 hover:text-code-foreground focus-visible:ring-[#007acc]',
            )}
            onClick={() => setIsExpanded(value => !value)}
            title={t(isExpanded ? '退出专注模式（Esc）' : '专注模式')}
            type="button"
          >
            {isExpanded ? (
              <Minimize2 aria-hidden="true" className="size-3.5" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-3.5" />
            )}
          </button>
        </div>
        {cppLanguages.has(language) ? (
          <CppCodeEditor source={source} theme={resolvedTheme} />
        ) : (
          <HighlightJsCode language={language} source={source} theme={theme} />
        )}
      </div>
    </>
  )
}
