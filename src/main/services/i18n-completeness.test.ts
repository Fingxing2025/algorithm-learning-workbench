import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const rendererRoot = resolve('src/renderer/src')
const i18nPath = resolve(rendererRoot, 'lib/i18n.tsx')
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) return null
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) return property.name.text
  return null
}

function collectEnglishKeys(): Set<string> {
  const source = readFileSync(i18nPath, 'utf8')
  const file = ts.createSourceFile(
    i18nPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const keys = new Set<string>()

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'english' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        const key = propertyName(property)
        if (key) keys.add(key)
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === 'Object' &&
      node.expression.name.text === 'assign' &&
      node.arguments[0]?.getText(file) === 'english' &&
      node.arguments[1] &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      for (const property of node.arguments[1].properties) {
        const key = propertyName(property)
        if (key) keys.add(key)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  return keys
}

describe('English interface translation coverage', () => {
  it('covers every Chinese production string and contains no raw Chinese JSX text', () => {
    const englishKeys = collectEnglishKeys()
    const failures: string[] = []
    const sourceFiles = (readdirSync(rendererRoot, { recursive: true }) as string[]).filter(
      relativePath =>
        /\.(ts|tsx)$/u.test(relativePath) &&
        !relativePath.includes('.test.') &&
        relativePath !== 'lib/i18n.tsx',
    )

    for (const relativePath of sourceFiles) {
      const absolutePath = resolve(rendererRoot, relativePath)
      const source = readFileSync(absolutePath, 'utf8')
      const file = ts.createSourceFile(
        absolutePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      const visit = (node: ts.Node) => {
        if (
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
          CJK_PATTERN.test(node.text) &&
          !englishKeys.has(node.text)
        ) {
          failures.push(`${relativePath}: missing translation for ${JSON.stringify(node.text)}`)
        }
        if (ts.isJsxText(node)) {
          const text = node.text.replace(/\s+/gu, ' ').trim()
          if (text && CJK_PATTERN.test(text)) {
            failures.push(`${relativePath}: raw JSX text ${JSON.stringify(text)}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }

    expect(failures).toEqual([])
  })

  it('covers static public errors returned by Main and Preload', () => {
    const englishKeys = collectEnglishKeys()
    const failures = new Set<string>()
    const inspectChineseStrings = (node: ts.Node, relativePath: string) => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        CJK_PATTERN.test(node.text) &&
        !englishKeys.has(node.text)
      ) {
        failures.add(
          `${relativePath}: missing public-error translation for ${JSON.stringify(node.text)}`,
        )
      }
      ts.forEachChild(node, child => inspectChineseStrings(child, relativePath))
    }

    const mainRoot = resolve('src/main')
    for (const relativePath of (readdirSync(mainRoot, { recursive: true }) as string[]).filter(
      path => path.endsWith('.ts') && !path.includes('.test.'),
    )) {
      const absolutePath = resolve(mainRoot, relativePath)
      const source = readFileSync(absolutePath, 'utf8')
      const file = ts.createSourceFile(absolutePath, source, ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'PublicError'
        ) {
          for (const argument of node.arguments?.slice(1) ?? []) {
            inspectChineseStrings(argument, relativePath)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }

    for (const relativePath of ['src/main/errors/public-error.ts', 'src/preload/index.ts']) {
      const source = readFileSync(resolve(relativePath), 'utf8')
      const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true)
      inspectChineseStrings(file, relativePath)
    }

    expect([...failures]).toEqual([])
  })
})
