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
        <button
          class="group-row"
          :class="{ selected: selectedEntryPath === group.path }"
          type="button"
          @click="$emit('open-group', group)"
        >
          <div class="root-main">
            <button
              class="root-expand-btn"
              type="button"
              :title="isExpanded(group.key) ? '收起' : '展开'"
              @click.stop="$emit('toggle-root', group.key)"
            >
              <ChevronRight :size="15" :class="{ rotated: isExpanded(group.key) }" />
            </button>
            <div class="root-text">
              <div class="root-name">
                <Folder :size="14" />
                <span>{{ group.name }}</span>
              </div>
              <div class="root-path">{{ group.path }}</div>
            </div>
          </div>
        </button>

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
              </div>
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
  Search
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
  selectedEntryPath: {
    type: String,
    default: ''
  }
})

defineEmits([
  'add-root',
  'open-group',
  'open-repository',
  'toggle-root',
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
</script>

<style scoped>
.project-sidebar {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  background: #232326;
  color: #f1f1f1;
  overflow: hidden;
}

.project-sidebar-header {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  gap: 10px;
  padding: 30px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
}

.header-title-row,
.header-actions,
.group-row,
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  color: rgba(255, 255, 255, 0.72);
}

.search-box:focus-within {
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: none;
}

.search-input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
  font-size: 13px;
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
  color: rgba(255, 255, 255, 0.58);
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
  text-align: left;
  cursor: pointer;
}

.group-row {
  padding: 10px 8px;
  border-radius: 10px;
}

.group-row:hover,
.child-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.group-row.selected,
.child-row.selected {
  background: linear-gradient(180deg, rgba(77, 135, 255, 0.24), rgba(77, 135, 255, 0.14));
  box-shadow: inset 0 0 0 1px rgba(103, 156, 255, 0.42);
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

.root-expand-btn,
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
}

.root-expand-btn:hover,
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
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
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.action-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn.primary {
  background: #2f6fed;
}

.action-btn.primary:hover {
  background: #3d7af2;
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
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.root-name {
  align-items: center;
}

.root-name :deep(svg),
.child-name :deep(svg) {
  flex: 0 0 auto;
}

.root-name span,
.child-name span {
  line-height: 1.2;
}

.root-path,
.child-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.54);
}

.child-kind {
  margin-left: 8px;
  color: rgba(255, 255, 255, 0.36);
}

.root-meta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  margin-left: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
}

.child-list {
  margin-top: 4px;
  min-width: 0;
  padding-left: 18px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  margin-left: 14px;
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

.repo-branch-row {
  color: rgba(255, 255, 255, 0.62);
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
}

.pending-files-icon,
.push-count,
.pull-count {
  flex: 0 0 auto;
}

.pending-files-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 4px;
  margin-right: 4px;
  transition: all 0.2s ease;
}

.pending-files-icon:hover {
  color: rgba(255, 255, 255, 0.7);
}

.push-count {
  display: flex;
  align-items: center;
}

.push-count-number {
  color: #28a745;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  margin-left: 4px;
  line-height: 1;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.pull-count {
  font-size: 11px;
  color: #ffc107;
  font-weight: 500;
  white-space: nowrap;
  margin-left: 4px;
  line-height: 1;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.rotated {
  transform: rotate(90deg);
}
</style>
