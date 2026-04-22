export const DEFAULT_THEME = 'slate-dual'

export const THEME_DEFINITIONS = Object.freeze({
  'slate-dual': {
    id: 'slate-dual',
    label: 'Slate Dual',
    appearance: 'dark'
  },
  'graphite-moss': {
    id: 'graphite-moss',
    label: 'Graphite Moss',
    appearance: 'dark'
  },
  'abyss-blue': {
    id: 'abyss-blue',
    label: 'Abyss Blue',
    appearance: 'dark'
  },
  'frost-slate': {
    id: 'frost-slate',
    label: 'Frost Slate',
    appearance: 'dark'
  },
  'mist-paper': {
    id: 'mist-paper',
    label: 'Mist Paper',
    appearance: 'light'
  },
  'aurora-paper': {
    id: 'aurora-paper',
    label: 'Aurora Paper',
    appearance: 'light'
  }
})

export const SUPPORTED_THEMES = Object.freeze(Object.keys(THEME_DEFINITIONS))
