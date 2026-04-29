const assert = require('assert')
const { createRemotesService } = require('../electron/mcp/services/remotes')

function createStore(entries = {}) {
  return {
    get(key, fallback = null) {
      return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : fallback
    }
  }
}

async function testGithubRemoteDoesNotInvokeGitlabLookup() {
  let gitlabLookupCount = 0

  const service = createRemotesService({
    store: createStore({
      'gitlab-config': {
        platform: 'github',
        url: 'https://github.com',
        token: 'github-token'
      }
    }),
    executeGitCommand: async () => ({
      success: true,
      stdout: 'git@github.com:TerraRoot3/OpenGit.git\n'
    }),
    fetch: async () => {
      throw new Error('fetch should not be called during detectProvider for GitHub remotes')
    },
    getGitlabProjectId: async () => {
      gitlabLookupCount += 1
      return { success: false }
    }
  })

  const detected = await service.detectProvider('/tmp/opengit')
  const repo = await service.getRepo('/tmp/opengit')

  assert.deepEqual(detected, {
    provider: 'github',
    supported: true
  })
  assert.equal(gitlabLookupCount, 0, 'GitHub remotes must not trigger GitLab project-id lookup')
  assert.equal(repo.provider, 'github')
  assert.equal(repo.projectPath, 'TerraRoot3/OpenGit')
}

async function testListPipelinesTimesOut() {
  const service = createRemotesService({
    store: createStore({
      'gitlab-config': {
        platform: 'github',
        url: 'https://github.com',
        token: 'github-token'
      }
    }),
    executeGitCommand: async () => ({
      success: true,
      stdout: 'git@github.com:TerraRoot3/OpenGit.git\n'
    }),
    fetch: async () => new Promise(() => {}),
    getGitlabProjectId: async () => ({ success: false }),
    requestTimeoutMs: 25
  })

  await assert.rejects(
    () => service.listPipelines('/tmp/opengit', 3),
    (error) => {
      assert.match(String(error?.message || error), /Remote request timed out/i)
      return true
    }
  )
}

async function main() {
  await testGithubRemoteDoesNotInvokeGitlabLookup()
  await testListPipelinesTimesOut()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
