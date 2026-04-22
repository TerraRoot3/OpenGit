<template>
  <aside class="project-sidebar" :class="{ collapsed: collapsed }">
    <div class="project-sidebar-header">
      <div class="header-title-row">
        <div class="header-title">项目</div>
        <button class="icon-btn" type="button" title="收起侧边栏" @click="$emit('toggle-collapse')">
          <PanelLeftClose :size="16" />
        </button>
      </div>
      <div class="header-actions">
        <button class="action-btn primary" type="button" @click="$emit('add-root')">
          <FolderPlus :size="15" />
          <span>添加目录</span>
        </button>
        <button
          class="icon-btn"
          type="button"
          title="刷新当前目录"
          :disabled="!canRefreshCurrentRoot || isCurrentRootRefreshing"
          @click="$emit('refresh-current-root')"
        >
          <RefreshCw :size="15" :class="{ spinning: isCurrentRootRefreshing }" />
        </button>
        <button class="icon-btn" type="button" title="全部展开" @click="$emit('expand-all')">
          <ChevronsDown :size="15" />
        </button>
        <button class="icon-btn" type="button" title="全部收起" @click="$emit('collapse-all')">
          <ChevronsUpDown :size="15" />
        </button>
      </div>
      <label class="search-box">
        <Search :size="15" />
        <input
          :value="searchQuery"
          class="search-input"
          type="text"
          placeholder="搜索目录或仓库"
          @input="$emit('update:searchQuery', $event.target.value)"
        />
      </label>
    </div>

    <div class="project-sidebar-body">
      <div v-if="filteredGroups.length === 0" class="empty-state">
        <FolderSearch :size="18" />
        <span>{{ hasRepositories ? '没有匹配的仓库' : '先添加一个目录开始扫描' }}</span>
      </div>

      <div v-for="group in filteredGroups" :key="group.key" class="root-section">
        <div class="group-row" :class="{ selected: selectedEntryPath === group.path }">
          <button
            class="group-row-main"
            type="button"
            @click="$emit('open-group', group)"
          >
            <div class="root-main">
              <div class="root-text">
                <div class="root-name">
                  <Folder :size="14" />
                  <span>{{ group.name }}</span>
                  <Star
                    v-if="isFavorited(group.path)"
                    :size="12"
                    class="favorite-indicator"
                    fill="currentColor"
                  />
                </div>
              </div>
            </div>
          </button>
          <button
            class="root-expand-btn"
            type="button"
            :title="isExpanded(group.key) ? '收起' : '展开'"
            @click.stop="$emit('toggle-root', group.key)"
          >
            <ChevronRight :size="15" :class="{ rotated: isExpanded(group.key) }" />
          </button>
        </div>

        <div v-if="isExpanded(group.key) && visibleRepositories(group).length > 0" class="child-list">
          <button
            v-for="repo in visibleRepositories(group)"
            :key="repo.path"
            class="child-row"
            :class="{ selected: selectedEntryPath === repo.path }"
            type="button"
            @click="$emit('open-repository', repo)"
          >
            <div class="repo-name-row">
              <div class="child-name">
                <span>{{ repo.name }}</span>
                <Star
                  v-if="isFavorited(repo.path)"
                  :size="12"
                  class="favorite-indicator"
                  fill="currentColor"
                />
              </div>
              <div class="repo-meta">
                <div
                  v-if="repo.gitStatus?.hasPendingFiles"
                  class="pending-files-icon"
                  title="有待定文件"
                >
                  <svg width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                    <path d="M526.41 117.029v58.514a7.314 7.314 0 0 1-7.315 7.314H219.429a36.571 36.571 0 0 0-35.987 29.989l-0.585 6.583V804.57a36.571 36.571 0 0 0 29.989 35.987l6.583 0.585H804.57a36.571 36.571 0 0 0 35.987-29.989l0.585-6.583v-317.44a7.314 7.314 0 0 1 7.314-7.314h58.514a7.314 7.314 0 0 1 7.315 7.314v317.44a109.714 109.714 0 0 1-99.182 109.203l-10.533 0.512H219.43a109.714 109.714 0 0 1-109.203-99.182l-0.512-10.533V219.43a109.714 109.714 0 0 1 99.182-109.203l10.533-0.512h299.666a7.314 7.314 0 0 1 7.314 7.315z m307.345 31.817l41.4 41.399a7.314 7.314 0 0 1 0 10.313L419.985 655.726a7.314 7.314 0 0 1-10.313 0l-41.399-41.4a7.314 7.314 0 0 1 0-10.312l455.168-455.168a7.314 7.314 0 0 1 10.313 0z"></path>
                  </svg>
                </div>
                <div class="push-count">
                  <span
                    v-if="(repo.gitStatus?.localAhead || 0) > 0"
                    class="push-count-number"
                    :title="`本地领先 ${repo.gitStatus?.localAhead || 0} 个提交`"
                  >
                    ↑{{ repo.gitStatus?.localAhead || 0 }}
                  </span>
                </div>
              </div>
            </div>
            <div class="repo-branch-row">
              <div class="repo-branch">
                <GitBranch :size="13" />
                <span>{{ repo.gitStatus?.branch || 'unknown' }}</span>
              </div>
              <span
                v-if="(repo.gitStatus?.remoteAhead || 0) > 0"
                class="pull-count"
                :title="`远程领先 ${repo.gitStatus?.remoteAhead || 0} 个提交`"
              >
                ↓{{ repo.gitStatus?.remoteAhead || 0 }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import {
  ChevronRight,
  ChevronsDown,
  ChevronsUpDown,
  Folder,
  FolderPlus,
  FolderSearch,
  GitBranch,
  PanelLeftClose,
  RefreshCw,
  Search,
  Star
} from 'lucide-vue-next'

const props = defineProps({
  groups: {
    type: Array,
    default: () => []
  },
  expandedRootPaths: {
    type: Array,
    default: () => []
  },
  searchQuery: {
    type: String,
    default: ''
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  selectedRootPath: {
    type: String,
    default: ''
  },
  canRefreshCurrentRoot: {
    type: Boolean,
    default: false
  },
  isCurrentRootRefreshing: {
    type: Boolean,
    default: false
  },
  selectedEntryPath: {
    type: String,
    default: ''
  },
  favoritePaths: {
    type: Array,
    default: () => []
  }
})

defineEmits([
  'add-root',
  'open-group',
  'open-repository',
  'toggle-root',
  'refresh-current-root',
  'toggle-collapse',
  'expand-all',
  'collapse-all',
  'update:searchQuery'
])

const normalizedQuery = computed(() => props.searchQuery.trim().toLowerCase())
const hasRepositories = computed(() => props.groups.length > 0)

const matchesQuery = (value) => {
  if (!normalizedQuery.value) return true
  return String(value || '').toLowerCase().includes(normalizedQuery.value)
}

const visibleRepositories = (group) => {
  const repositories = Array.isArray(group.repositories) ? group.repositories : []
  if (!normalizedQuery.value) return repositories
  return repositories.filter((repo) => matchesQuery(repo.name) || matchesQuery(repo.path) || matchesQuery(repo.relativePath))
}

const filteredGroups = computed(() => {
  return props.groups.filter((group) => {
    if (!normalizedQuery.value) return true
    if (matchesQuery(group.name) || matchesQuery(group.path)) return true
    return visibleRepositories(group).length > 0
  })
})

const isExpanded = (path) => {
  if (normalizedQuery.value) return true
  return props.expandedRootPaths.includes(path)
}

const isFavorited = (path) => {
  const normalizedPath = String(path || '').trim()
  return normalizedPath ? props.favoritePaths.includes(normalizedPath) : false
}
</script>

<style scoped>
.project-sidebar {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  background: var(--theme-sem-bg-sidebar);
  color: var(--theme-sem-text-primary);
  overflow: hidden;
}

.project-sidebar-header {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  gap: 10px;
  padding: 30px 14px 12px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-sem-bg-sidebar-soft) 36%, transparent),
    transparent
  );
}

.header-title-row,
.header-actions,
.group-row,
.group-row-main,
.root-main,
.child-name,
.repo-name-row,
.repo-branch-row,
.repo-branch {
  display: flex;
  align-items: center;
}

.header-title-row,
.group-row {
  justify-content: space-between;
}

.group-row {
  gap: 6px;
}

.group-row-main {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
}

.header-actions {
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  height: 34px;
  border-radius: 9px;
  background: var(--theme-sem-hover);
  border: 1px solid transparent;
  color: var(--theme-sem-text-secondary);
  outline: none;
}

.search-box:focus-within {
  border-color: transparent;
  box-shadow: none;
  outline: none;
}

.search-input {
  flex: 1;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--theme-sem-text-primary);
  font-size: 13px;
  line-height: 34px;
  box-shadow: none;
  appearance: none;
  -webkit-appearance: none;
}

.search-input:focus,
.search-input:focus-visible {
  outline: none;
  box-shadow: none;
}

.project-sidebar-body {
  flex: 1;
  width: 100%;
  min-width: 0;
  overflow: auto;
  padding: 10px 8px 14px;
}

.empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  color: var(--theme-sem-text-muted);
  font-size: 13px;
}

.root-section {
  margin-bottom: 8px;
  min-width: 0;
}

.group-row,
.child-row {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: left;
  cursor: pointer;
}

.group-row {
  padding: 10px 8px;
  border-radius: 10px;
}

.group-row:hover,
.child-row:hover {
  background: var(--theme-sem-hover);
}

.group-row.selected,
.child-row.selected {
  background: var(--theme-comp-sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.group-row.selected .root-name,
.group-row.selected .root-meta,
.child-row.selected .child-name,
.child-row.selected .child-git-meta,
.child-row.selected .child-status,
.child-row.selected .repo-branch-row,
.child-row.selected .repo-branch span,
.child-row.selected .repo-meta,
.child-row.selected .push-count-number {
  color: var(--theme-comp-selected-text);
}

.root-main {
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.root-expand-btn,
.icon-btn,
.action-btn {
  border: 0;
  cursor: pointer;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-secondary);
}

.icon-btn:disabled {
  opacity: 0.42;
  cursor: default;
}

.root-expand-btn:hover,
.icon-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 65%, white 35%);
}

.spinning {
  animation: sidebar-spin 1s linear infinite;
}

@keyframes sidebar-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.root-expand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 8px;
  background: transparent;
  color: var(--theme-sem-text-muted);
}

.root-expand-btn:hover {
  background: transparent;
  color: var(--theme-sem-text-primary);
}

.action-btn {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  min-width: 0;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.action-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn.primary {
  flex: 0 0 auto;
  padding: 0 8px;
  gap: 4px;
  background: var(--theme-sem-selected-bg);
  box-shadow: inset 0 0 0 1px var(--theme-sem-selected-border);
  color: var(--theme-comp-selected-text);
}

.action-btn.primary:hover {
  background: color-mix(in srgb, var(--theme-sem-selected-bg) 85%, white 15%);
}

.root-text,
.child-row {
  min-width: 0;
}

.root-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.root-name,
.child-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.root-name {
  align-items: center;
}

.favorite-indicator {
  flex: 0 0 auto;
  color: #facc15;
  opacity: 0.92;
}

.root-name :deep(svg),
.child-name :deep(svg) {
  flex: 0 0 auto;
}

.root-name span,
.child-name span {
  line-height: 1.2;
}

.child-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--theme-sem-text-muted);
}

.child-kind {
  margin-left: 8px;
  color: color-mix(in srgb, var(--theme-sem-text-muted) 80%, transparent);
}

.root-meta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  margin-left: 8px;
  font-size: 11px;
  color: var(--theme-sem-text-secondary);
}

.child-list {
  margin-top: 4px;
  min-width: 0;
  padding-left: 12px;
}

.child-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
}

.repo-name-row,
.repo-branch-row {
  width: 100%;
  min-width: 0;
  justify-content: space-between;
  gap: 8px;
}

.repo-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
}

.repo-branch-row {
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
}

.repo-branch {
  gap: 6px;
  min-width: 0;
}

.repo-branch span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-sem-text-primary);
}

.repo-meta,
.pending-files-icon,
.push-count,
.pull-count {
  flex: 0 0 auto;
}

.pending-files-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-sem-text-muted);
  margin-left: 4px;
  margin-right: 4px;
  transition: all 0.2s ease;
}

.pending-files-icon:hover {
  color: var(--theme-sem-text-secondary);
}

.push-count {
  display: flex;
  align-items: center;
}

.push-count-number {
  color: var(--theme-sem-accent-success);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  margin-left: 4px;
}

.pull-count {
  font-size: 11px;
  color: var(--theme-sem-accent-warning);
  font-weight: 500;
  white-space: nowrap;
  margin-left: 4px;
}

.rotated {
  transform: rotate(90deg);
}
</style>
