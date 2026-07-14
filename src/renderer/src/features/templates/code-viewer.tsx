import hljs from 'highlight.js/lib/core'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
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
import { useEffect, useMemo, useState } from 'react'

const CODE_THEME_STORAGE_KEY = 'ui:code-theme'

const codeThemes = [
  { label: '跟随应用', value: 'system' },
  { label: 'VS Code Light+', value: 'vscode-light' },
  { label: 'VS Code Dark+', value: 'vscode-dark' },
  { label: 'Monokai', value: 'monokai' },
] as const

type CodeTheme = (typeof codeThemes)[number]['value']

const languages = {
  c,
  cpp,
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
  C: 'c',
  'C#': 'csharp',
  'C++': 'cpp',
  'C/C++ Header': 'cpp',
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

function getInitialCodeTheme(): CodeTheme {
  const stored = window.localStorage.getItem(CODE_THEME_STORAGE_KEY)
  return codeThemes.some(theme => theme.value === stored) ? (stored as CodeTheme) : 'system'
}

export function CodeViewer({ code, language }: { code: string; language: string }) {
  const [theme, setTheme] = useState<CodeTheme>(getInitialCodeTheme)
  const source = code || '// 空模板文件'
  const highlighted = useMemo(() => {
    const registeredLanguage = languageAliases[language]
    return registeredLanguage
      ? hljs.highlight(source, { ignoreIllegals: true, language: registeredLanguage }).value
      : hljs.highlightAuto(source).value
  }, [language, source])

  useEffect(() => {
    window.localStorage.setItem(CODE_THEME_STORAGE_KEY, theme)
  }, [theme])

  return (
    <div className="flex min-h-40 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-inner">
      <div className="flex h-9 shrink-0 items-center border-b border-white/10 bg-code px-3">
        <span className="text-[10px] font-medium text-code-foreground/70">{language}</span>
        <label className="ml-auto flex items-center gap-2 text-[10px] text-code-foreground/70">
          代码主题
          <select
            aria-label="代码主题"
            className="h-6 rounded-md border border-white/15 bg-black/15 px-2 text-[10px] text-code-foreground outline-none focus:ring-2 focus:ring-ring"
            onChange={event => setTheme(event.target.value as CodeTheme)}
            value={theme}
          >
            {codeThemes.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <pre
        aria-label="高亮模板源码"
        className="code-surface min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-5"
        data-code-theme={theme}
        tabIndex={0}
      >
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  )
}
