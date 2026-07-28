export const DEFAULT_PIPELINE_MONITORING_ENABLED = false

export const getPipelineMonitoringConfigKey = (projectPath = '') => (
  `projectPipelineMonitoring_${
    String(projectPath || '').replace(/[^a-zA-Z0-9]/g, '_') || 'default'
  }`
)

export const normalizePipelineMonitoringEnabled = (value) => (
  value === true
  || value === 1
  || String(value || '').trim().toLowerCase() === 'true'
  || String(value || '').trim() === '1'
)

export const shouldPollPipeline = ({
  monitoringEnabled = DEFAULT_PIPELINE_MONITORING_ENABLED,
  hasProject = true,
  isActive = true,
  isDocumentVisible = true,
  isGitRepository = true
} = {}) => (
  monitoringEnabled === true
  && hasProject === true
  && isActive === true
  && isDocumentVisible === true
  && isGitRepository === true
)
