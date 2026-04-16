import assert from 'node:assert/strict'
import { resolveTagsViewState } from '../src/components/git/projectDetailTagsState.mjs'

assert.equal(
  resolveTagsViewState({ tagsLoading: true, tags: [{ name: 'v1.0.0' }] }),
  'list',
  'refreshing with existing tags should keep showing the list'
)

assert.equal(
  resolveTagsViewState({ tagsLoading: true, tags: [] }),
  'loading',
  'initial loading without tags should show the loading state'
)

assert.equal(
  resolveTagsViewState({ tagsLoading: false, tags: [] }),
  'empty',
  'loaded without tags should show the empty state'
)

console.log('project detail tags state assertions passed')
