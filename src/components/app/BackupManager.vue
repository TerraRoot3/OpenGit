<template>
  <div class="backup-manager">
    <section class="backup-section">
      <div class="section-heading">
        <div>
          <h3>导出配置</h3>
          <p>保存当前项目列表、远端配置和工作区偏好。</p>
        </div>
        <Download :size="18" />
      </div>

      <div class="category-list">
        <label
          v-for="category in BACKUP_CATEGORIES"
          :key="`export:${category.id}`"
          class="category-option"
        >
          <input
            v-model="selectedExportCategories"
            type="checkbox"
            :value="category.id"
          />
          <span class="category-copy">
            <span class="category-title">
              {{ category.label }}
              <span v-if="category.sensitive" class="sensitive-badge">含凭据</span>
            </span>
            <span>{{ category.description }}</span>
          </span>
        </label>
      </div>

      <div class="sensitive-note">
        <ShieldAlert :size="16" />
        <span>远端配置可能包含访问令牌。请将备份文件保存在可信位置。</span>
      </div>

      <button
        class="primary-action"
        type="button"
        :disabled="isBusy || selectedExportCategories.length === 0"
        @click="exportBackup"
      >
        <Download :size="16" />
        {{ isExporting ? '正在导出…' : '导出备份文件' }}
      </button>
    </section>

    <section class="backup-section">
      <div class="section-heading">
        <div>
          <h3>恢复配置</h3>
          <p>只恢复当前版本仍支持的配置，不会导入旧浏览器数据。</p>
        </div>
        <Upload :size="18" />
      </div>

      <button
        class="file-picker"
        type="button"
        :disabled="isBusy"
        @click="chooseBackupFile"
      >
        <FileJson :size="18" />
        <span>
          <strong>{{ loadedFileName || '选择 OpenGit 备份文件' }}</strong>
          <small v-if="loadedBackup">
            创建于 {{ formatBackupTime(loadedBackup.createdAt) }}
          </small>
          <small v-else>支持当前的 OpenGit 配置备份格式</small>
        </span>
      </button>

      <div v-if="loadedBackup" class="restore-summary">
        <label
          v-for="category in availableRestoreCategories"
          :key="`restore:${category.id}`"
          class="category-option"
        >
          <input
            v-model="selectedRestoreCategories"
            type="checkbox"
            :value="category.id"
          />
          <span class="category-copy">
            <span class="category-title">{{ category.label }}</span>
            <span>{{ restoreCounts[category.id] }} 项配置</span>
          </span>
        </label>
      </div>

      <button
        v-if="loadedBackup"
        class="primary-action"
        type="button"
        :disabled="isBusy || selectedRestoreCategories.length === 0"
        @click="restoreBackup"
      >
        <Upload :size="16" />
        {{ isRestoring ? '正在恢复…' : '恢复所选配置' }}
      </button>
    </section>

    <div
      v-if="statusMessage"
      class="backup-status"
      :class="statusType"
      role="status"
    >
      <CheckCircle2 v-if="statusType === 'success'" :size="16" />
      <ShieldAlert v-else :size="16" />
      <span>{{ statusMessage }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  CheckCircle2,
  Download,
  FileJson,
  ShieldAlert,
  Upload
} from 'lucide-vue-next'
import { useConfirm } from '../../composables/useConfirm.js'
import { useProjectSidebarStore } from '../../stores/projectSidebarStore.js'
import { useThemeStore } from '../../stores/themeStore.js'
import {
  BACKUP_CATEGORIES,
  createBackupDocument,
  parseBackupDocument,
  selectRestoreConfigs,
  summarizeBackupConfigs
} from './backupConfig.mjs'

const { confirm: showConfirm } = useConfirm()
const sidebarStore = useProjectSidebarStore()
const themeStore = useThemeStore()

const selectedExportCategories = ref(BACKUP_CATEGORIES.map((category) => category.id))
const selectedRestoreCategories = ref([])
const loadedBackup = ref(null)
const loadedFileName = ref('')
const isExporting = ref(false)
const isRestoring = ref(false)
const statusMessage = ref('')
const statusType = ref('success')

const isBusy = computed(() => isExporting.value || isRestoring.value)
const restoreCounts = computed(() => summarizeBackupConfigs(loadedBackup.value?.configs))
const availableRestoreCategories = computed(() => (
  BACKUP_CATEGORIES.filter((category) => restoreCounts.value[category.id] > 0)
))

const setStatus = (message, type = 'success') => {
  statusMessage.value = String(message || '')
  statusType.value = type === 'error' ? 'error' : 'success'
}

const formatBackupTime = (value) => {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return date.toLocaleString('zh-CN', { hour12: false })
}

const buildBackupFileName = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `opengit-backup-${stamp}.json`
}

const exportBackup = async () => {
  if (!window.electronAPI?.getAllConfigs || !window.electronAPI?.showSaveDialog) {
    setStatus('当前环境不支持导出配置', 'error')
    return
  }

  isExporting.value = true
  setStatus('')
  try {
    const allConfigs = await window.electronAPI.getAllConfigs()
    const backup = createBackupDocument({
      allConfigs,
      categoryIds: selectedExportCategories.value
    })
    const configCount = Object.keys(backup.configs).length
    if (configCount === 0) {
      throw new Error('所选分类中没有可导出的配置')
    }

    const dialogResult = await window.electronAPI.showSaveDialog({
      title: '导出 OpenGit 配置备份',
      defaultPath: buildBackupFileName(),
      filters: [{ name: 'OpenGit 配置备份', extensions: ['json'] }]
    })
    if (dialogResult?.canceled || !dialogResult?.filePath) return

    const saveResult = await window.electronAPI.saveFile({
      filePath: dialogResult.filePath,
      content: `${JSON.stringify(backup, null, 2)}\n`
    })
    if (!saveResult?.success) {
      throw new Error(saveResult?.error || '写入备份文件失败')
    }
    setStatus(`已导出 ${configCount} 项配置`)
  } catch (error) {
    setStatus(error?.message || '导出失败', 'error')
  } finally {
    isExporting.value = false
  }
}

const chooseBackupFile = async () => {
  if (!window.electronAPI?.showOpenDialog || !window.electronAPI?.readFile) {
    setStatus('当前环境不支持读取备份文件', 'error')
    return
  }

  setStatus('')
  try {
    const result = await window.electronAPI.showOpenDialog({
      title: '选择 OpenGit 配置备份',
      properties: ['openFile'],
      filters: [{ name: 'OpenGit 配置备份', extensions: ['json'] }]
    })
    const filePath = result?.filePaths?.[0]
    if (result?.canceled || !filePath) return

    const content = await window.electronAPI.readFile(filePath)
    const parsed = parseBackupDocument(content)
    loadedBackup.value = parsed
    loadedFileName.value = filePath.split(/[\\/]/).filter(Boolean).pop() || filePath
    selectedRestoreCategories.value = [...parsed.categories]
  } catch (error) {
    loadedBackup.value = null
    loadedFileName.value = ''
    selectedRestoreCategories.value = []
    setStatus(error?.message || '读取备份失败', 'error')
  }
}

const restoreBackup = async () => {
  const configs = selectRestoreConfigs(
    loadedBackup.value,
    selectedRestoreCategories.value
  )
  const entries = Object.entries(configs)
  if (entries.length === 0) {
    setStatus('没有选中可恢复的配置', 'error')
    return
  }

  const confirmed = await showConfirm({
    title: '恢复 OpenGit 配置',
    message: `将覆盖当前的 ${entries.length} 项配置，是否继续？`,
    detail: '项目侧边栏和皮肤会立即更新；已打开的项目工作区设置会在下次打开时生效。',
    type: 'warning',
    confirmText: '恢复',
    cancelText: '取消'
  })
  if (!confirmed) return

  isRestoring.value = true
  setStatus('')
  try {
    for (const [key, value] of entries) {
      const success = await window.electronAPI?.setConfig?.(key, value)
      if (success === false) {
        throw new Error(`写入配置失败：${key}`)
      }
    }

    const sidebarPayload = configs['project-sidebar-state-v1']
    if (sidebarPayload) {
      sidebarStore.restoreFromBackup(sidebarPayload)
    }

    if (typeof configs['opengit-theme'] === 'string') {
      await themeStore.setTheme(configs['opengit-theme'])
    }

    setStatus(`已恢复 ${entries.length} 项配置`)
  } catch (error) {
    setStatus(error?.message || '恢复失败', 'error')
  } finally {
    isRestoring.value = false
  }
}
</script>

<style scoped>
.backup-manager {
  display: flex;
  box-sizing: border-box;
  overflow: auto;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 16px;
}

.backup-section {
  display: flex;
  flex-direction: column;
  gap: 13px;
  width: min(100%, 760px);
  box-sizing: border-box;
  padding: 15px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-sem-surface-1) 92%, transparent);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--theme-sem-text-secondary);
}

.section-heading h3 {
  margin: 0;
  color: var(--theme-sem-text-primary);
  font-size: 14px;
  font-weight: 650;
}

.section-heading p {
  margin: 5px 0 0;
  color: var(--theme-sem-text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.category-list,
.restore-summary {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.category-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--theme-sem-bg-workspace);
  cursor: pointer;
}

.category-option:hover {
  border-color: var(--theme-sem-border-default);
}

.category-option input {
  width: 15px;
  height: 15px;
  margin: 2px 0 0;
  accent-color: var(--theme-sem-accent-primary);
}

.category-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  color: var(--theme-sem-text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  font-weight: 600;
}

.sensitive-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-sem-accent-warning-strong) 18%, transparent);
  color: var(--theme-sem-accent-warning);
  font-size: 10px;
  font-weight: 600;
}

.sensitive-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-sem-accent-warning-strong) 10%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.sensitive-note svg {
  flex: 0 0 auto;
  color: var(--theme-sem-accent-warning);
}

.primary-action,
.file-picker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border: 0;
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  background: var(--theme-sem-accent-primary);
  color: var(--theme-sem-text-on-accent);
  font-size: 12px;
  font-weight: 650;
}

.primary-action:hover:not(:disabled) {
  filter: brightness(1.08);
}

.primary-action:disabled,
.file-picker:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.file-picker {
  justify-content: flex-start;
  padding: 10px 12px;
  border: 1px dashed var(--theme-sem-border-default);
  background: var(--theme-sem-bg-workspace);
  color: var(--theme-sem-text-secondary);
  text-align: left;
}

.file-picker:hover:not(:disabled) {
  border-color: var(--theme-sem-accent-primary);
}

.file-picker > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.file-picker strong {
  overflow: hidden;
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-picker small {
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.backup-status {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 760px);
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.backup-status.success {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 12%, transparent);
  color: var(--theme-sem-accent-success);
}

.backup-status.error {
  background: color-mix(in srgb, var(--theme-sem-accent-danger-strong) 12%, transparent);
  color: var(--theme-sem-accent-danger);
}
</style>
