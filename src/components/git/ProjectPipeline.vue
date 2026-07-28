<template>
  <div class="pipeline-section">
    <div class="pipeline-content">
      <div class="pipeline-list-panel">
        <div class="pipeline-list-header">
          <div class="header-left">
            <span>流水线</span>
            <span class="panel-count">({{ totalPipelineCount }})</span>
          </div>
          <div class="pipeline-header-actions">
            <label
              class="monitor-toggle"
              title="自动监控 GitHub Actions 或 GitLab 流水线"
            >
              <input
                type="checkbox"
                :checked="monitoringEnabled"
                @change="handleMonitoringToggle"
              >
              <span class="monitor-toggle-track" aria-hidden="true">
                <span class="monitor-toggle-thumb"></span>
              </span>
              <span>{{ monitoringEnabled ? '监控中' : '监控关闭' }}</span>
            </label>
            <button class="refresh-btn" :disabled="loading" @click="refreshPipelines">
              {{ loading ? '刷新中...' : '刷新' }}
            </button>
          </div>
        </div>

        <div class="pipeline-list">
          <div v-if="errorMessage" class="pipeline-tip error">{{ errorMessage }}</div>
          <template v-else>
            <div v-if="activePipelines.length > 0" class="pipeline-group-label">进行中</div>
            <button
              v-for="pipeline in activePipelines"
              :key="`active-${pipeline.id}`"
              :class="['pipeline-item', { active: selectedPipelineId === pipeline.id }]"
              @click="selectPipeline(pipeline.id)"
            >
              <div class="pipeline-row top">
                <div class="pipeline-workflow">
                  <span :class="['status-dot', statusClass(pipeline.status)]"></span>
                  <span class="pipeline-workflow-name">{{ getPipelineTitle(pipeline) }}</span>
                </div>
                <span class="pipeline-time">{{ formatTime(pipeline.updatedAt || pipeline.createdAt) }}</span>
              </div>
              <div class="pipeline-row bottom">
                <div class="pipeline-meta">
                  <span :class="['pipeline-status', statusTextClass(pipeline.status)]">{{ getStatusLabel(pipeline.status) }}</span>
                  <span v-if="getPipelineSecondary(pipeline)" class="pipeline-target">{{ getPipelineSecondary(pipeline) }}</span>
                </div>
                <span class="pipeline-id">#{{ getPipelineDisplayNumber(pipeline) }}</span>
              </div>
            </button>

            <div v-if="recentPipelines.length > 0" class="pipeline-group-label">最近</div>
            <button
              v-for="pipeline in recentPipelines"
              :key="`recent-${pipeline.id}`"
              :class="['pipeline-item', { active: selectedPipelineId === pipeline.id }]"
              @click="selectPipeline(pipeline.id)"
            >
              <div class="pipeline-row top">
                <div class="pipeline-workflow">
                  <span :class="['status-dot', statusClass(pipeline.status)]"></span>
                  <span class="pipeline-workflow-name">{{ getPipelineTitle(pipeline) }}</span>
                </div>
                <span class="pipeline-time">{{ formatTime(pipeline.updatedAt || pipeline.createdAt) }}</span>
              </div>
              <div class="pipeline-row bottom">
                <div class="pipeline-meta">
                  <span :class="['pipeline-status', statusTextClass(pipeline.status)]">{{ getStatusLabel(pipeline.status) }}</span>
                  <span v-if="getPipelineSecondary(pipeline)" class="pipeline-target">{{ getPipelineSecondary(pipeline) }}</span>
                </div>
                <span class="pipeline-id">#{{ getPipelineDisplayNumber(pipeline) }}</span>
              </div>
            </button>

            <div
              v-if="!loading && activePipelines.length === 0 && recentPipelines.length === 0"
              class="pipeline-tip"
            >
              {{ emptyMessage }}
            </div>
          </template>
        </div>
      </div>

      <div class="pipeline-detail-panel">
        <div class="pipeline-detail-header">
          <div class="header-left">
            <template v-if="selectedPipeline">
              <span class="pipeline-header-title">{{ getPipelineTitle(selectedPipeline) }}</span>
              <span class="pipeline-header-number">{{ selectedPipeline.providerLabel || pipelineProviderLabel }} · #{{ getPipelineDisplayNumber(selectedPipeline) }}</span>
            </template>
            <span v-else>选择流水线查看详情</span>
          </div>
          <button
            v-if="selectedPipeline?.webUrl"
            class="open-web-btn"
            @click="openPipelineWebUrl(selectedPipeline.webUrl)"
          >
            打开 {{ selectedPipeline?.providerLabel || pipelineProviderLabel }}
          </button>
        </div>

        <div v-if="detailError" class="pipeline-detail-tip error">{{ detailError }}</div>
        <div v-else-if="detailLoading" class="pipeline-detail-tip">正在读取流水线详情...</div>
        <div v-else-if="!selectedPipeline" class="pipeline-detail-tip">请选择一条流水线查看详情</div>
        <div v-else class="pipeline-detail-content">
          <div class="pipeline-summary-grid">
            <div class="summary-card">
              <span class="summary-label">状态</span>
              <span :class="['summary-value', statusTextClass(selectedPipeline.status)]">
                {{ getStatusLabel(selectedPipeline.status) }}
              </span>
            </div>
            <div class="summary-card">
              <span class="summary-label">{{ selectedPipeline.provider === 'github' ? '工作流' : '目标' }}</span>
              <span class="summary-value">{{ selectedPipeline.provider === 'github' ? getPipelineTitle(selectedPipeline) : getPipelineDisplayRef(selectedPipeline) }}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">{{ selectedPipeline.provider === 'github' ? '目标' : '来源' }}</span>
              <span class="summary-value">{{ selectedPipeline.provider === 'github' ? getPipelineDisplayRef(selectedPipeline) : (selectedPipeline.source || '-') }}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">耗时</span>
              <span class="summary-value">{{ formatDuration(selectedPipeline) }}</span>
            </div>
          </div>

          <div class="stage-list">
            <div
              v-for="stage in stageSections"
              :key="stage.stage"
              class="stage-card"
            >
              <div class="stage-header">
                <div class="stage-title">{{ stage.stage }}</div>
                <div class="stage-meta">
                  <span v-if="stage.statusSummary.running > 0" class="stage-count running">{{ stage.statusSummary.running }} 进行中</span>
                  <span v-if="stage.statusSummary.failed > 0" class="stage-count failed">{{ stage.statusSummary.failed }} 失败</span>
                  <span v-if="stage.statusSummary.success > 0" class="stage-count success">{{ stage.statusSummary.success }} 成功</span>
                </div>
              </div>
              <div class="job-list">
                <button
                  v-for="job in stage.jobs"
                  :key="job.id"
                  type="button"
                  :class="['job-item', { clickable: job.webUrl }]"
                  :disabled="!job.webUrl"
                  :title="job.webUrl ? `在 ${pipelineProviderLabel} 中打开 ${job.name}` : ''"
                  @click="openPipelineWebUrl(job.webUrl)"
                >
                  <div class="job-main">
                    <span :class="['status-dot', statusClass(job.status)]"></span>
                    <span class="job-name">{{ job.name }}</span>
                  </div>
                  <div class="job-meta">
                    <span :class="['job-status', statusTextClass(job.status)]">{{ getStatusLabel(job.status) }}</span>
                    <span class="job-duration">{{ formatJobDuration(job) }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { shouldPollPipeline } from './projectPipelineMonitoringState.mjs'

const props = defineProps({
  projectPath: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  monitoringEnabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:monitoringEnabled',
  'summary-updated'
])

const loading = ref(false)
const detailLoading = ref(false)
const errorMessage = ref('')
const detailError = ref('')
const activePipelines = ref([])
const recentPipelines = ref([])
const selectedPipelineId = ref(null)
const pipelineDetail = ref(null)
const pipelineProvider = ref('')
const isDocumentVisible = ref(typeof document === 'undefined' ? true : document.visibilityState === 'visible')
const PIPELINE_ACTIVE_POLL_INTERVAL_MS = 15000
const PIPELINE_IDLE_POLL_INTERVAL_MS = 120000
let pollTimer = null

const totalPipelineCount = computed(() => activePipelines.value.length + recentPipelines.value.length)
const pipelineProviderLabel = computed(() => {
  if (pipelineDetail.value?.providerLabel) return pipelineDetail.value.providerLabel
  if (selectedPipeline.value?.providerLabel) return selectedPipeline.value.providerLabel
  if (pipelineProvider.value === 'github') return 'GitHub Actions'
  if (pipelineProvider.value === 'gitlab') return 'GitLab'
  return '流水线'
})
const emptyMessage = computed(() => (
  !props.monitoringEnabled
    ? '流水线监控已关闭。开启后自动检查运行状态，也可以手动刷新一次。'
    : pipelineProvider.value === 'github'
    ? '当前 GitHub 仓库暂无 Actions 运行记录'
    : '当前项目暂无可展示的流水线'
))
const selectedPipeline = computed(() => {
  const pipeline = activePipelines.value.find(item => item.id === selectedPipelineId.value)
    || recentPipelines.value.find(item => item.id === selectedPipelineId.value)
  return pipeline || pipelineDetail.value?.pipeline || null
})
const stageSections = computed(() => pipelineDetail.value?.stages || [])

const clearPollTimer = () => {
  if (pollTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(pollTimer)
  }
  pollTimer = null
}

const schedulePoll = () => {
  clearPollTimer()
  if (
    typeof window === 'undefined'
    || !shouldPollPipeline({
      monitoringEnabled: props.monitoringEnabled,
      hasProject: Boolean(props.projectPath),
      isActive: props.isActive,
      isDocumentVisible: isDocumentVisible.value
    })
  ) return
  const delay = activePipelines.value.length > 0
    ? PIPELINE_ACTIVE_POLL_INTERVAL_MS
    : PIPELINE_IDLE_POLL_INTERVAL_MS
  pollTimer = window.setTimeout(() => {
    pollTimer = null
    loadPipelines({ silent: true })
  }, delay)
}

const getStatusLabel = (status) => ({
  running: '运行中',
  pending: '排队中',
  preparing: '准备中',
  waiting_for_resource: '等待资源',
  created: '已创建',
  success: '成功',
  failed: '失败',
  canceled: '已取消',
  skipped: '已跳过',
  manual: '手动',
  scheduled: '计划中'
}[status] || status || '未知')

const statusClass = (status) => `status-${status || 'unknown'}`
const statusTextClass = (status) => `status-text-${status || 'unknown'}`

const getPipelineDisplayRef = (pipeline) => {
  if (!pipeline) return '-'
  if (!pipeline.ref) return pipeline.name || `运行 #${pipeline.iid || pipeline.id}`
  return pipeline.isTag ? `标签 · ${pipeline.ref}` : `分支 · ${pipeline.ref}`
}

const getPipelineDisplayNumber = (pipeline) => (
  pipeline?.runNumber || pipeline?.iid || pipeline?.id || '-'
)

const getPipelineTitle = (pipeline) => {
  if (!pipeline) return '-'
  if (pipeline.provider === 'github') {
    return pipeline.workflowName || pipeline.name || pipeline.displayTitle || getPipelineDisplayRef(pipeline)
  }
  return getPipelineDisplayRef(pipeline)
}

const getPipelineSecondary = (pipeline) => {
  if (!pipeline || pipeline.provider !== 'github') return ''
  return getPipelineDisplayRef(pipeline)
}

const formatTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatSeconds = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remain = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${remain}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

const formatDuration = (pipeline) => {
  if (!pipeline?.startedAt) return '-'
  const start = new Date(pipeline.startedAt).getTime()
  const end = pipeline.finishedAt ? new Date(pipeline.finishedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '-'
  return formatSeconds((end - start) / 1000)
}

const formatJobDuration = (job) => {
  if (typeof job?.duration === 'number') return formatSeconds(job.duration)
  if (job?.startedAt) {
    const start = new Date(job.startedAt).getTime()
    const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return formatSeconds((end - start) / 1000)
    }
  }
  return '-'
}

const openPipelineWebUrl = (url) => {
  if (!url) return
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

const handleMonitoringToggle = (event) => {
  emit('update:monitoringEnabled', event?.target?.checked === true)
}

const refreshPipelines = () => loadPipelines({ manual: true })

const selectPipeline = async (pipelineId) => {
  selectedPipelineId.value = pipelineId
  await loadPipelineDetail(pipelineId)
}

const loadPipelineDetail = async (pipelineId = selectedPipelineId.value, { silent = false } = {}) => {
  if (!props.projectPath || !pipelineId) return
  if (!silent) detailLoading.value = true
  detailError.value = ''

  try {
    const result = await window.electronAPI.pipelineDetail({
      projectPath: props.projectPath,
      pipelineId
    })

    if (!result?.success) {
      throw new Error(result?.message || '读取流水线详情失败')
    }

    pipelineDetail.value = result.data
  } catch (error) {
    detailError.value = error.message || '读取流水线详情失败'
  } finally {
    detailLoading.value = false
  }
}

const loadPipelines = async ({ silent = false, manual = false } = {}) => {
  if (!props.projectPath || (!props.monitoringEnabled && !manual)) {
    clearPollTimer()
    return
  }
  if (!silent) loading.value = true
  if (!silent) errorMessage.value = ''

  try {
    const result = await window.electronAPI.projectPipelines({
      projectPath: props.projectPath,
      limit: 12
    })

    if (!result?.success) {
      throw new Error(result?.message || '读取流水线失败')
    }

    pipelineProvider.value = result.data?.provider || ''
    activePipelines.value = result.data?.activePipelines || []
    recentPipelines.value = result.data?.recentPipelines || []
    emit('summary-updated', {
      currentRunning: result.data?.currentRunning || null,
      latestRecent: recentPipelines.value[0] || null
    })

    const nextSelectedId = selectedPipelineId.value
      && [...activePipelines.value, ...recentPipelines.value].some(item => item.id === selectedPipelineId.value)
      ? selectedPipelineId.value
      : (activePipelines.value[0]?.id || recentPipelines.value[0]?.id || null)

    selectedPipelineId.value = nextSelectedId

    if (nextSelectedId) {
      await loadPipelineDetail(nextSelectedId, { silent: true })
    } else {
      pipelineDetail.value = null
      detailError.value = ''
    }
  } catch (error) {
    errorMessage.value = error.message || '读取流水线失败'
    pipelineProvider.value = ''
    activePipelines.value = []
    recentPipelines.value = []
    pipelineDetail.value = null
  } finally {
    loading.value = false
    schedulePoll()
  }
}

const handleVisibilityChange = () => {
  isDocumentVisible.value = document.visibilityState === 'visible'
  if (isDocumentVisible.value && props.monitoringEnabled) {
    loadPipelines({ silent: true })
  } else {
    clearPollTimer()
  }
}

watch(() => props.projectPath, () => {
  activePipelines.value = []
  recentPipelines.value = []
  selectedPipelineId.value = null
  pipelineDetail.value = null
  pipelineProvider.value = ''
  errorMessage.value = ''
  detailError.value = ''
  clearPollTimer()
  if (props.monitoringEnabled) {
    loadPipelines()
  }
}, { immediate: true })

watch(() => props.isActive, (active) => {
  if (active && props.monitoringEnabled) {
    loadPipelines({ silent: true })
  } else {
    clearPollTimer()
  }
})

watch(() => props.monitoringEnabled, (enabled) => {
  if (enabled && props.isActive && isDocumentVisible.value) {
    loadPipelines()
  } else {
    clearPollTimer()
  }
})

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  clearPollTimer()
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})
</script>

<style scoped>
.pipeline-section {
  flex: 1;
  background: var(--theme-sem-bg-project);
  border: none;
  border-radius: var(--theme-comp-radius-selected);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pipeline-content {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--theme-sem-bg-project);
}

.pipeline-list-panel {
  width: 280px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--theme-sem-bg-project);
  overflow: hidden;
}

.pipeline-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--theme-sem-bg-project);
  overflow: hidden;
}

.pipeline-list-header,
.pipeline-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--theme-comp-child-header-bg);
  color: var(--theme-sem-text-primary);
  font-size: 13px;
  font-weight: 500;
  height: 40px;
  min-height: 40px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pipeline-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.monitor-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-sem-text-muted);
  font-size: 11px;
  font-weight: normal;
  cursor: pointer;
  user-select: none;
}

.monitor-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.monitor-toggle-track {
  position: relative;
  width: 30px;
  height: 17px;
  border: 1px solid var(--theme-sem-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-sem-surface-2) 84%, transparent);
  transition: background 0.16s ease, border-color 0.16s ease;
}

.monitor-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--theme-sem-text-muted);
  transition: transform 0.16s ease, background 0.16s ease;
}

.monitor-toggle input:checked + .monitor-toggle-track {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 62%, transparent);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 42%, transparent);
}

.monitor-toggle input:checked + .monitor-toggle-track .monitor-toggle-thumb {
  transform: translateX(13px);
  background: var(--theme-sem-text-on-accent);
}

.monitor-toggle:focus-within .monitor-toggle-track {
  outline: 2px solid color-mix(in srgb, var(--theme-sem-accent-primary) 32%, transparent);
  outline-offset: 2px;
}

.pipeline-header-title,
.pipeline-workflow-name,
.pipeline-target {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipeline-header-title {
  color: var(--theme-sem-text-primary);
}

.pipeline-header-number {
  color: var(--theme-sem-text-muted);
  font-size: 11px;
  font-weight: normal;
  flex-shrink: 0;
}

.panel-count {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
  font-weight: normal;
}

.refresh-btn,
.open-web-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-sem-hover) 76%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.refresh-btn:hover:not(:disabled),
.open-web-btn:hover {
  background: var(--theme-sem-hover);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.pipeline-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
}

.pipeline-group-label {
  padding: 10px 14px 6px;
  color: var(--theme-sem-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.pipeline-item {
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 10px;
  margin-bottom: 4px;
}

.pipeline-item:hover {
  background: var(--theme-sem-hover);
}

.pipeline-item.active {
  background: var(--theme-comp-sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.pipeline-item.active,
.pipeline-item.active .pipeline-row,
.pipeline-item.active .pipeline-label,
.pipeline-item.active .pipeline-meta,
.pipeline-item.active .pipeline-workflow {
  color: var(--theme-comp-selected-text);
}

.pipeline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pipeline-row.bottom {
  margin-top: 6px;
}

.pipeline-workflow,
.pipeline-meta {
  display: flex;
  align-items: center;
  min-width: 0;
}

.pipeline-workflow {
  gap: 8px;
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  font-weight: 500;
}

.pipeline-meta {
  gap: 7px;
}

.pipeline-target {
  color: var(--theme-sem-text-muted);
  font-size: 11px;
}

.pipeline-time,
.pipeline-id,
.pipeline-status {
  font-size: 11px;
  color: var(--theme-sem-text-muted);
  flex-shrink: 0;
}

.pipeline-detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 12px;
}

.pipeline-detail-tip,
.pipeline-tip {
  padding: 16px;
  color: var(--theme-sem-text-muted);
  font-size: 13px;
}

.pipeline-detail-tip.error,
.pipeline-tip.error {
  color: var(--theme-sem-accent-danger);
}

.pipeline-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.summary-card,
.stage-card {
  background: color-mix(in srgb, var(--theme-sem-hover) 42%, transparent);
  border-radius: 12px;
  padding: 12px;
}

.summary-label {
  display: block;
  font-size: 11px;
  color: var(--theme-sem-text-muted);
  margin-bottom: 6px;
}

.summary-value {
  font-size: 13px;
  color: var(--theme-sem-text-primary);
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stage-header,
.job-item,
.job-main,
.job-meta {
  display: flex;
  align-items: center;
}

.stage-header,
.job-item {
  justify-content: space-between;
  gap: 12px;
}

.stage-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-sem-text-primary);
}

.stage-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-count,
.job-status,
.job-duration {
  font-size: 11px;
  color: var(--theme-sem-text-muted);
}

.stage-count.running,
.status-text-running,
.status-text-pending,
.status-text-preparing,
.status-text-waiting_for_resource,
.status-text-created {
  color: var(--theme-sem-accent-warning);
}

.stage-count.failed,
.status-text-failed,
.status-text-canceled {
  color: var(--theme-sem-accent-danger);
}

.stage-count.success,
.status-text-success {
  color: var(--theme-sem-accent-success-strong);
}

.status-text-skipped,
.status-text-manual,
.status-text-scheduled,
.status-text-unknown {
  color: var(--theme-sem-text-muted);
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.job-item {
  width: 100%;
  border: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-hover) 34%, transparent);
  color: inherit;
  font: inherit;
  text-align: left;
}

.job-item.clickable {
  cursor: pointer;
}

.job-item.clickable:hover {
  background: var(--theme-sem-hover);
}

.job-item:disabled {
  opacity: 1;
}

.job-main {
  gap: 8px;
  min-width: 0;
}

.job-name {
  font-size: 12px;
  color: var(--theme-sem-text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  background: var(--theme-sem-border-strong);
}

.status-running,
.status-pending,
.status-preparing,
.status-waiting_for_resource,
.status-created {
  background: var(--theme-sem-accent-warning-strong);
}

.status-success {
  background: var(--theme-sem-accent-success-strong);
}

.status-failed,
.status-canceled {
  background: var(--theme-sem-accent-danger-strong);
}

.status-skipped,
.status-manual,
.status-scheduled,
.status-unknown {
  background: var(--theme-sem-border-strong);
}

@media (max-width: 1024px) {
  .pipeline-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .pipeline-content {
    flex-direction: column;
  }

  .pipeline-list-panel {
    width: 100%;
    min-width: unset;
    max-height: 320px;
  }

  .pipeline-summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
