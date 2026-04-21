<template>
  <div class="pipeline-section">
    <div class="pipeline-content">
      <div class="pipeline-list-panel">
        <div class="pipeline-list-header">
          <div class="header-left">
            <span>流水线</span>
            <span class="panel-count">({{ totalPipelineCount }})</span>
          </div>
          <button class="refresh-btn" :disabled="loading" @click="loadPipelines">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
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
                <div class="pipeline-ref">
                  <span :class="['status-dot', statusClass(pipeline.status)]"></span>
                  <span>{{ getPipelineDisplayRef(pipeline) }}</span>
                </div>
                <span class="pipeline-time">{{ formatTime(pipeline.updatedAt || pipeline.createdAt) }}</span>
              </div>
              <div class="pipeline-row bottom">
                <span class="pipeline-status">{{ getStatusLabel(pipeline.status) }}</span>
                <span class="pipeline-id">#{{ pipeline.id }}</span>
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
                <div class="pipeline-ref">
                  <span :class="['status-dot', statusClass(pipeline.status)]"></span>
                  <span>{{ getPipelineDisplayRef(pipeline) }}</span>
                </div>
                <span class="pipeline-time">{{ formatTime(pipeline.updatedAt || pipeline.createdAt) }}</span>
              </div>
              <div class="pipeline-row bottom">
                <span class="pipeline-status">{{ getStatusLabel(pipeline.status) }}</span>
                <span class="pipeline-id">#{{ pipeline.id }}</span>
              </div>
            </button>

            <div
              v-if="!loading && activePipelines.length === 0 && recentPipelines.length === 0"
              class="pipeline-tip"
            >
              当前项目暂无可展示的 GitLab Pipeline
            </div>
          </template>
        </div>
      </div>

      <div class="pipeline-detail-panel">
        <div class="pipeline-detail-header">
          <div class="header-left">
            <span v-if="selectedPipeline">流水线 #{{ selectedPipeline.id }}</span>
            <span v-else>选择流水线查看详情</span>
          </div>
          <button
            v-if="selectedPipeline?.webUrl"
            class="open-web-btn"
            @click="openPipelineWebUrl(selectedPipeline.webUrl)"
          >
            打开 GitLab
          </button>
        </div>

        <div v-if="detailError" class="pipeline-detail-tip error">{{ detailError }}</div>
        <div v-else-if="detailLoading" class="pipeline-detail-tip">正在读取流水线详情...</div>
        <div v-else-if="!selectedPipeline" class="pipeline-detail-tip">请选择一条流水线查看详情</div>
        <div v-else class="pipeline-detail-content">
          <div class="pipeline-summary-grid">
            <div class="summary-card">
              <span class="summary-label">状态</span>
              <span :class="['summary-value', statusClass(selectedPipeline.status)]">
                {{ getStatusLabel(selectedPipeline.status) }}
              </span>
            </div>
            <div class="summary-card">
              <span class="summary-label">目标</span>
              <span class="summary-value">{{ getPipelineDisplayRef(selectedPipeline) }}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">来源</span>
              <span class="summary-value">{{ selectedPipeline.source || '-' }}</span>
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
                <div v-for="job in stage.jobs" :key="job.id" class="job-item">
                  <div class="job-main">
                    <span :class="['status-dot', statusClass(job.status)]"></span>
                    <span class="job-name">{{ job.name }}</span>
                  </div>
                  <div class="job-meta">
                    <span class="job-status">{{ getStatusLabel(job.status) }}</span>
                    <span class="job-duration">{{ formatJobDuration(job) }}</span>
                  </div>
                </div>
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

const props = defineProps({
  projectPath: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
})

const loading = ref(false)
const detailLoading = ref(false)
const errorMessage = ref('')
const detailError = ref('')
const activePipelines = ref([])
const recentPipelines = ref([])
const selectedPipelineId = ref(null)
const pipelineDetail = ref(null)
const isDocumentVisible = ref(typeof document === 'undefined' ? true : document.visibilityState === 'visible')
let pollTimer = null

const totalPipelineCount = computed(() => activePipelines.value.length + recentPipelines.value.length)
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
  if (!props.isActive || !isDocumentVisible.value || typeof window === 'undefined') return
  const delay = activePipelines.value.length > 0 ? 6000 : 18000
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

const getPipelineDisplayRef = (pipeline) => {
  if (!pipeline) return '-'
  return pipeline.isTag ? `标签 · ${pipeline.ref}` : `分支 · ${pipeline.ref}`
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
  window.electronAPI?.openUrlInNewTab?.(url)
}

const selectPipeline = async (pipelineId) => {
  selectedPipelineId.value = pipelineId
  await loadPipelineDetail(pipelineId)
}

const loadPipelineDetail = async (pipelineId = selectedPipelineId.value, { silent = false } = {}) => {
  if (!props.projectPath || !pipelineId) return
  if (!silent) detailLoading.value = true
  detailError.value = ''

  try {
    const result = await window.electronAPI.gitlabPipelineDetail({
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

const loadPipelines = async ({ silent = false } = {}) => {
  if (!props.projectPath) return
  if (!silent) loading.value = true
  if (!silent) errorMessage.value = ''

  try {
    const result = await window.electronAPI.gitlabProjectPipelines({
      projectPath: props.projectPath,
      limit: 12
    })

    if (!result?.success) {
      throw new Error(result?.message || '读取 GitLab Pipeline 失败')
    }

    activePipelines.value = result.data?.activePipelines || []
    recentPipelines.value = result.data?.recentPipelines || []

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
    errorMessage.value = error.message || '读取 GitLab Pipeline 失败'
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
  if (isDocumentVisible.value) {
    loadPipelines({ silent: true })
  } else {
    clearPollTimer()
  }
}

watch(() => props.projectPath, () => {
  selectedPipelineId.value = null
  pipelineDetail.value = null
  loadPipelines()
}, { immediate: true })

watch(() => props.isActive, (active) => {
  if (active) {
    loadPipelines({ silent: true })
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
  background: var(--app-project-bg);
  border: none;
  border-radius: var(--app-selected-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pipeline-content {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--app-project-bg);
}

.pipeline-list-panel {
  width: 280px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--app-project-bg);
  overflow: hidden;
}

.pipeline-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--app-project-bg);
  overflow: hidden;
}

.pipeline-list-header,
.pipeline-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--app-project-bg);
  color: rgba(255, 255, 255, 0.92);
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
}

.panel-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: normal;
}

.refresh-btn,
.open-web-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
  color: rgba(255, 255, 255, 0.84);
  font-size: 12px;
  cursor: pointer;
}

.refresh-btn:hover:not(:disabled),
.open-web-btn:hover {
  background: rgba(255, 255, 255, 0.08);
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
  color: rgba(255, 255, 255, 0.46);
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
  background: rgba(255, 255, 255, 0.05);
}

.pipeline-item.active {
  background: var(--app-sidebar-selected-bg);
  border-radius: var(--app-selected-radius);
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

.pipeline-ref {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
}

.pipeline-time,
.pipeline-id,
.pipeline-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.52);
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
  color: rgba(255, 255, 255, 0.54);
  font-size: 13px;
}

.pipeline-detail-tip.error,
.pipeline-tip.error {
  color: #fda4af;
}

.pipeline-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.summary-card,
.stage-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 12px;
}

.summary-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.summary-value {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
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
  color: rgba(255, 255, 255, 0.9);
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
  color: rgba(255, 255, 255, 0.54);
}

.stage-count.running,
.summary-value.status-running,
.summary-value.status-pending,
.summary-value.status-preparing,
.summary-value.status-waiting_for_resource,
.summary-value.status-created {
  color: #f4d37d;
}

.stage-count.failed,
.summary-value.status-failed,
.summary-value.status-canceled {
  color: #fca5a5;
}

.stage-count.success,
.summary-value.status-success {
  color: #86efac;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.job-item {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.job-main {
  gap: 8px;
  min-width: 0;
}

.job-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.88);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.28);
}

.status-running,
.status-pending,
.status-preparing,
.status-waiting_for_resource,
.status-created {
  background: #d99b20;
}

.status-success {
  background: #22c55e;
}

.status-failed,
.status-canceled {
  background: #ef4444;
}

.status-skipped,
.status-manual,
.status-scheduled,
.status-unknown {
  background: rgba(255, 255, 255, 0.4);
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
