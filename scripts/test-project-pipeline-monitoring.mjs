import assert from 'node:assert/strict'
import {
  DEFAULT_PIPELINE_MONITORING_ENABLED,
  getPipelineMonitoringConfigKey,
  normalizePipelineMonitoringEnabled,
  shouldPollPipeline
} from '../src/components/git/projectPipelineMonitoringState.mjs'

assert.equal(DEFAULT_PIPELINE_MONITORING_ENABLED, false)
assert.equal(normalizePipelineMonitoringEnabled(undefined), false)
assert.equal(normalizePipelineMonitoringEnabled(false), false)
assert.equal(normalizePipelineMonitoringEnabled('false'), false)
assert.equal(normalizePipelineMonitoringEnabled(true), true)
assert.equal(normalizePipelineMonitoringEnabled('true'), true)
assert.equal(normalizePipelineMonitoringEnabled(1), true)

assert.equal(
  getPipelineMonitoringConfigKey('/Users/test/GitHub/OpenGit'),
  'projectPipelineMonitoring__Users_test_GitHub_OpenGit'
)
assert.equal(
  getPipelineMonitoringConfigKey('/Users/test/GitLab/OpenGit'),
  'projectPipelineMonitoring__Users_test_GitLab_OpenGit',
  'monitoring settings must be isolated by project path'
)

assert.equal(shouldPollPipeline(), false)
assert.equal(shouldPollPipeline({ monitoringEnabled: true }), true)
assert.equal(
  shouldPollPipeline({
    monitoringEnabled: true,
    isActive: false
  }),
  false
)
assert.equal(
  shouldPollPipeline({
    monitoringEnabled: true,
    isDocumentVisible: false
  }),
  false
)
assert.equal(
  shouldPollPipeline({
    monitoringEnabled: true,
    isGitRepository: false
  }),
  false
)

console.log('project pipeline monitoring assertions passed')
