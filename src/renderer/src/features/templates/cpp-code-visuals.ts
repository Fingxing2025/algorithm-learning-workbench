import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  ViewPlugin,
} from '@codemirror/view'

const bracketPairs: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
}

const closingBrackets = new Set(Object.values(bracketPairs))

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function detectIndentSize(state: EditorState): number {
  const widths: number[] = []
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber)
    if (!line.text.trim() || line.text.startsWith('\t')) continue
    const leadingSpaces = line.text.match(/^ +/)?.[0].length ?? 0
    if (leadingSpaces > 0) widths.push(leadingSpaces)
  }

  if (widths.length === 0) return 4
  const divisor = widths.reduce(greatestCommonDivisor)
  return divisor === 2 ? 2 : 4
}

function indentationWidth(whitespace: string, tabSize: number): number {
  let width = 0
  for (const character of whitespace) {
    width += character === '\t' ? tabSize - (width % tabSize) : 1
  }
  return width
}

function buildCppDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const indentSize = detectIndentSize(state)

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber)
    const leadingWhitespace = line.text.match(/^[\t ]+/)?.[0] ?? ''
    const indentLevel = Math.floor(indentationWidth(leadingWhitespace, indentSize) / indentSize)
    if (indentLevel === 0) continue

    ranges.push(
      Decoration.line({
        attributes: {
          class: 'cm-indent-guides',
          style: `--cm-indent-level: ${indentLevel}; --cm-indent-size: ${indentSize}ch`,
        },
      }).range(line.from),
    )
  }

  const stack: Array<{ bracket: string; depth: number }> = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'PrimitiveType') {
        ranges.push(Decoration.mark({ class: 'cm-cpp-primitive-type' }).range(node.from, node.to))
        return
      }
      if (node.name === 'SystemLibString') {
        ranges.push(Decoration.mark({ class: 'cm-cpp-header' }).range(node.from, node.to))
        return
      }

      const bracket = node.name
      if (bracket in bracketPairs) {
        const depth = stack.length % 6
        stack.push({ bracket, depth })
        ranges.push(
          Decoration.mark({ class: `cm-rainbow-bracket-${depth}` }).range(node.from, node.to),
        )
        return
      }
      if (!closingBrackets.has(bracket)) return

      const expectedOpeningBracket = Object.keys(bracketPairs).find(
        openingBracket => bracketPairs[openingBracket] === bracket,
      )
      const openingBracket = stack.at(-1)
      if (!openingBracket || openingBracket.bracket !== expectedOpeningBracket) return

      stack.pop()
      ranges.push(
        Decoration.mark({ class: `cm-rainbow-bracket-${openingBracket.depth}` }).range(
          node.from,
          node.to,
        ),
      )
    },
  })

  return Decoration.set(ranges, true)
}

export const cppCodeVisuals = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCppDecorations(view.state)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildCppDecorations(update.state)
      }
    }
  },
  { decorations: value => value.decorations },
)
