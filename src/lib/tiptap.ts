import { Extension, Node } from '@tiptap/core'
import type { JSONContent } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { escapeRegExp } from './utils'
import type { MentionRef } from '../types'

export const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

type NameEntry = { id: string; name: string }

const highlightCache: {
  signature: string
  regex: RegExp | null
  names: Map<string, string>
} = { signature: '', regex: null, names: new Map() }

export function createCharacterHighlight(getEntries: () => NameEntry[]) {
  return Extension.create({
    name: 'characterHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('characterHighlight'),
          props: {
            decorations(state) {
              const entries = getEntries().filter((e) => e.name && e.name.trim())
              if (!entries.length) return DecorationSet.empty
              const signature = entries.map((e) => `${e.id}=${e.name}`).join('\u0001')
              if (signature !== highlightCache.signature) {
                highlightCache.signature = signature
                const names = new Map<string, string>()
                for (const entry of [...entries].sort((a, b) => b.name.length - a.name.length)) {
                  const name = entry.name.trim()
                  if (name && !names.has(name)) names.set(name, entry.id)
                }
                highlightCache.names = names
                const patterns = [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
                highlightCache.regex = patterns.length ? new RegExp(patterns.join('|'), 'g') : null
              }
              const regex = highlightCache.regex
              if (!regex) return DecorationSet.empty
              const decorations: Decoration[] = []
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return
                regex.lastIndex = 0
                let match: RegExpExecArray | null
                while ((match = regex.exec(node.text))) {
                  const id = highlightCache.names.get(match[0])
                  if (id) {
                    decorations.push(
                      Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                        class: 'char-name',
                        'data-char': id,
                      }),
                    )
                  }
                  if (match[0].length === 0) regex.lastIndex += 1
                }
              })
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
      ]
    },
  })
}

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      type: { default: 'character' },
      id: { default: '' },
      label: { default: '' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
        getAttrs: (element) => {
          const el = element as HTMLElement
          return {
            type: el.getAttribute('data-mention') || 'character',
            id: el.getAttribute('data-id') || '',
            label: el.getAttribute('data-label') || '',
          }
        },
      },
    ]
  },
  renderHTML({ node }) {
    const type = String(node.attrs.type || 'character')
    return [
      'span',
      {
        class: `mention-chip mention-${type}`,
        'data-mention': type,
        'data-id': node.attrs.id,
        'data-label': node.attrs.label,
      },
      `@${node.attrs.label}`,
    ]
  },
})

const BLOCK_BREAK = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'codeBlock',
  'horizontalRule',
])

export function extractPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'text') {
      out.push(node.text || '')
    } else if (node.type === 'mention') {
      out.push(`@${node.attrs?.label || ''}`)
    } else if (node.type === 'hardBreak') {
      out.push('\n')
    }
    if (node.content) {
      node.content.forEach(walk)
    }
    if (node.type && BLOCK_BREAK.has(node.type)) {
      if (node.type === 'horizontalRule') out.push('\n')
      else out.push('\n')
    }
  }
  walk(doc)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function extractMentions(doc: JSONContent | null | undefined): MentionRef[] {
  if (!doc) return []
  const seen = new Set<string>()
  const result: MentionRef[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'mention') {
      const type = String(node.attrs?.type || '')
      const id = String(node.attrs?.id || '')
      const label = String(node.attrs?.label || '')
      const key = `${type}:${id}`
      if (type && id && !seen.has(key)) {
        seen.add(key)
        result.push({ type: type as MentionRef['type'], id, label })
      }
    }
    node.content?.forEach(walk)
  }
  walk(doc)
  return result
}

export function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  if (!doc) return true
  return extractPlainText(doc).length === 0 && extractMentions(doc).length === 0
}

export function textToDoc(text: string): JSONContent {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    type: 'doc',
    content: paragraphs.length
      ? paragraphs.map((p) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: p }],
        }))
      : [{ type: 'paragraph' }],
  }
}
