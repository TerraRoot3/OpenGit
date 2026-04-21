<template>
  <div class="main-content">
    <!-- 项目详情 -->
    <div v-if="projectInfo" class="project-detail">
      <!-- 头部 -->
      <div class="header">
        <div class="project-info">
          <h1 :title="projectInfo.path">
            {{ projectInfo.name }}
            <span class="current-branch-inline" :class="{ 'detached-head': currentBranch.includes('HEAD detached') }">
              <GitBranch v-if="!currentBranch.includes('HEAD detached')" :size="16" />
              <Tag v-else :size="16" />
              {{ currentBranch }}
              <span v-if="branchStatus" class="header-branch-status">
                <span v-if="branchStatus.remoteAhead > 0" class="pull-indicator">↓{{ branchStatus.remoteAhead }}</span>
                <span v-if="branchStatus.localAhead > 0" class="push-indicator">↑{{ branchStatus.localAhead }}</span>
              </span>
              <button
                v-if="activePipelineSummary"
                class="pipeline-status-pill"
                :class="pipelineStatusClass"
                type="button"
                @click="selectPipeline"
                :title="pipelineStatusTitle"
              >
                <Activity :size="12" />
                {{ pipelineStatusText }}
              </button>
              <span v-if="hasPendingFiles" class="pending-indicator" title="有待定文件">
                <svg width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                  <path d="M526.41 117.029v58.514a7.314 7.314 0 0 1-7.315 7.314H219.429a36.571 36.571 0 0 0-35.987 29.989l-0.585 6.583V804.57a36.571 36.571 0 0 0 29.989 35.987l6.583 0.585H804.57a36.571 36.571 0 0 0 35.987-29.989l0.585-6.583v-317.44a7.314 7.314 0 0 1 7.314-7.314h58.514a7.314 7.314 0 0 1 7.315 7.314v317.44a109.714 109.714 0 0 1-99.182 109.203l-10.533 0.512H219.43a109.714 109.714 0 0 1-109.203-99.182l-0.512-10.533V219.43a109.714 109.714 0 0 1 99.182-109.203l10.533-0.512h299.666a7.314 7.314 0 0 1 7.314 7.315z m307.345 31.817l41.4 41.399a7.314 7.314 0 0 1 0 10.313L419.985 655.726a7.314 7.314 0 0 1-10.313 0l-41.399-41.4a7.314 7.314 0 0 1 0-10.312l455.168-455.168a7.314 7.314 0 0 1 10.313 0z"></path>
                </svg>
              </span>
              <RefreshCw v-if="statusLoading" :size="14" class="status-loading" />
            </span>
          </h1>
        </div>
        <div class="header-actions">
            <button class="pull-single-btn" @click="pullProject" :title="pullTitle">
              <GitPullRequest :size="14" /> 拉取
            </button>
            <button class="push-single-btn" @click="pushProject" :title="pushTitle">
              <ArrowUpCircle :size="14" /> 推送
            </button>
            <button class="mr-single-btn" @click="openMRDialog" title="创建 Merge Request">
              <GitMerge :size="14" /> MR
            </button>
            <button class="gitlab-open-btn" @click="openWithGitLab" title="打开 GitLab">
            <ExternalLink :size="14" /> GitLab
          </button>
          <button class="finder-open-btn" @click="openInFinder" :title="`在${systemFileManagerLabel}中打开`">
            <FolderOpen :size="14" /> {{ systemFileManagerLabel }}
          </button>
          <button
            class="favorite-project-btn"
            :class="{ active: isFavorite }"
            @click="toggleFavorite"
            :title="isFavorite ? '取消收藏项目' : '收藏项目'"
          >
            <Star :size="14" :fill="isFavorite ? 'currentColor' : 'none'" />
            <span>{{ isFavorite ? '已收藏' : '收藏' }}</span>
          </button>
          <button class="settings-btn" @click="openProjectSettings" title="项目设置">
            <Settings :size="14" /> 设置
          </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div
        class="project-main-area"
        :class="{ 'project-main-area--branch-rail': isBranchesPanelIconRail }"
      >
        <div
          class="content-wrapper"
          :class="{ 'content-wrapper--branch-rail': isBranchesPanelIconRail }"
        >
          <!-- 左侧面板（宽度可拖拽，按项目缓存） -->
          <div
            class="branches-panel"
            :class="{ 'branches-panel--icon-rail': isBranchesPanelIconRail }"
            :style="{ width: `${branchesPanelWidthPx}px`, minWidth: `${BRANCHES_PANEL_RAIL_MIN}px` }"
          >
            <div class="branches-panel-list-head">
              <button
                type="button"
                class="branches-panel-list-head-btn rail-tip-target"
                :class="{ 'branches-panel-list-head-btn--rail': isBranchesPanelIconRail }"
                :title="isBranchesPanelIconRail ? '展开侧栏' : '收起为图标条'"
                :data-rail-tip="isBranchesPanelIconRail ? '导航 · 展开' : '导航 · 收起'"
                @click="toggleBranchesPanelRail"
              >
                <PanelLeftClose v-if="!isBranchesPanelIconRail" :size="16" class="branches-panel-list-head-ico" />
                <PanelLeftOpen v-else :size="16" class="branches-panel-list-head-ico" />
                <span v-if="!isBranchesPanelIconRail" class="branches-panel-list-head-text">导航</span>
              </button>
            </div>
            <div class="branches-panel-scroll">
            <div
              class="file-status-button rail-tip-target"
              title="AI会话"
              data-rail-tip="AI会话"
              :class="{ active: currentView === 'ai-sessions' }"
              @click="selectAiSessions"
            >
              <Bot :size="16" />
              <span class="branches-nav-label">AI会话</span>
            </div>

            <!-- 终端按钮 -->
            <div
              class="file-status-button rail-tip-target"
              title="终端"
              data-rail-tip="终端"
              :class="{ active: currentView === 'terminal' }"
              @click="selectTerminal"
            >
              <TerminalIcon :size="16" />
              <span class="branches-nav-label">终端</span>
            </div>

            <div
              class="file-status-button rail-tip-target"
              title="工作区"
              data-rail-tip="工作区"
              :class="{ active: currentView === 'workspace' }"
              @click="selectWorkspace"
            >
              <FolderTree :size="16" />
              <span class="branches-nav-label">工作区</span>
              <span v-if="hasPendingFiles" class="pending-icon" title="有待定文件">
                <svg width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                  <path d="M526.41 117.029v58.514a7.314 7.314 0 0 1-7.315 7.314H219.429a36.571 36.571 0 0 0-35.987 29.989l-0.585 6.583V804.57a36.571 36.571 0 0 0 29.989 35.987l6.583 0.585H804.57a36.571 36.571 0 0 0 35.987-29.989l0.585-6.583v-317.44a7.314 7.314 0 0 1 7.314-7.314h58.514a7.314 7.314 0 0 1 7.315 7.314v317.44a109.714 109.714 0 0 1-99.182 109.203l-10.533 0.512H219.43a109.714 109.714 0 0 1-109.203-99.182l-0.512-10.533V219.43a109.714 109.714 0 0 1 99.182-109.203l10.533-0.512h299.666a7.314 7.314 0 0 1 7.314 7.315z m307.345 31.817l41.4 41.399a7.314 7.314 0 0 1 0 10.313L419.985 655.726a7.314 7.314 0 0 1-10.313 0l-41.399-41.4a7.314 7.314 0 0 1 0-10.312l455.168-455.168a7.314 7.314 0 0 1 10.313 0z"></path>
                </svg>
              </span>
            </div>

            <!-- 提交历史按钮 -->
            <div
              class="file-status-button rail-tip-target"
              title="流水线"
              data-rail-tip="流水线"
              :class="{ active: currentView === 'pipeline' }"
              @click="selectPipeline"
            >
              <Activity :size="16" />
              <span class="branches-nav-label">流水线</span>
              <span
                v-if="activePipelineSummary"
                class="pipeline-inline-status"
                :class="pipelineStatusClass"
              >
                {{ getPipelineInlineRef(activePipelineSummary) }}
              </span>
            </div>

            <div
              class="file-status-button rail-tip-target"
              title="提交历史"
              data-rail-tip="提交历史"
              :class="{ active: currentView === 'commit-history' }"
              @click="selectCommitHistory"
            >
              <History :size="16" />
              <span class="branches-nav-label">提交历史</span>
            </div>

            <!-- 暂存列表按钮 -->
            <div
              class="file-status-button rail-tip-target"
              title="暂存列表"
              data-rail-tip="暂存列表"
              :class="{ active: currentView === 'stash-list' }"
              @click="selectStashList"
            >
              <Archive :size="16" />
              <span class="branches-nav-label">暂存列表</span>
            </div>

            <!-- 本地分支 -->
            <div class="branch-section">
              <div
                class="branch-section-header rail-tip-target"
                title="本地分支"
                data-rail-tip="本地分支"
                @click="toggleLocalBranches"
              >
                <GitBranch :size="14" />
                <span class="branch-section-label">本地分支</span>
                <ChevronRight :size="14" class="expand-arrow" :class="{ expanded: showLocalBranches }" />
              </div>
              <div v-if="showLocalBranches && !isBranchesPanelIconRail" class="branch-list">
                <div 
                  v-for="branch in allBranches" 
                  :key="branch"
                  class="branch-item"
                  :class="{ active: branch === currentBranch }"
                  @dblclick="switchBranch(branch)"
                  @contextmenu.prevent="showBranchContextMenu($event, branch, 'local')"
                >
                  <span class="branch-name">{{ branch }}</span>
                  <span v-if="getAllBranchStatus(branch)" class="branch-status-indicator">
                    <span v-if="getAllBranchStatus(branch).remoteAhead > 0" class="pull-indicator">
                      ↓{{ getAllBranchStatus(branch).remoteAhead }}
                    </span>
                    <span v-if="getAllBranchStatus(branch).localAhead > 0" class="push-indicator">
                      ↑{{ getAllBranchStatus(branch).localAhead }}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- 远程分支 -->
            <div class="branch-section">
              <div
                class="branch-section-header rail-tip-target"
                title="远程分支"
                data-rail-tip="远程分支"
                @click="toggleRemoteBranches"
              >
                <Cloud :size="14" />
                <span class="branch-section-label">远程分支</span>
                <button 
                  class="refresh-btn" 
                  @click.stop="refreshRemoteBranches"
                  :class="{ refreshing: refreshing, success: refreshSuccess }"
                  title="刷新远程分支"
                >
                  <RefreshCw v-if="!refreshSuccess" :size="12" />
                  <Check v-else :size="12" />
                </button>
                <ChevronRight :size="14" class="expand-arrow" :class="{ expanded: showRemoteBranches }" />
              </div>
              <div v-if="showRemoteBranches && !isBranchesPanelIconRail" class="branch-list">
                <div v-if="refreshing && remoteBranches.length === 0" class="empty-tags">加载中...</div>
                <div v-else-if="remoteBranches.length === 0" class="empty-tags">暂无远程分支</div>
                <div 
                  v-else
                  v-for="branch in remoteBranches" 
                  :key="branch"
                  class="branch-item remote-branch"
                  @dblclick="switchToRemoteBranch(branch.replace('origin/', ''))"
                  @contextmenu.prevent="showBranchContextMenu($event, branch, 'remote')"
                >
                  <span class="branch-name">{{ branch }}</span>
                </div>
              </div>
            </div>

            <!-- 标签 -->
            <div class="branch-section">
              <div
                class="branch-section-header rail-tip-target"
                title="标签"
                data-rail-tip="标签"
                @click="toggleTags"
              >
                <Tag :size="14" />
                <span class="branch-section-label">标签</span>
                <button
                  class="refresh-btn"
                  @click.stop="refreshTags"
                  :class="{ refreshing: tagsRefreshing, success: tagsRefreshSuccess }"
                  title="刷新标签"
                >
                  <RefreshCw v-if="!tagsRefreshSuccess" :size="12" />
                  <Check v-else :size="12" />
                </button>
                <ChevronRight :size="14" class="expand-arrow" :class="{ expanded: showTags }" />
              </div>
              <div v-if="showTags && !isBranchesPanelIconRail" class="branch-list">
                <div v-if="tagsViewState === 'loading'" class="empty-tags">加载中...</div>
                <div v-else-if="tagsViewState === 'empty'" class="empty-tags">暂无标签</div>
                <div 
                  v-else
                  v-for="tag in tags" 
                  :key="tag.name"
                  class="tag-item"
                  @dblclick="checkoutTag(tag)"
                  @contextmenu.prevent="handleTagContextMenu($event, tag)"
                >
                  <span class="branch-name">{{ tag.name }}</span>
                </div>
              </div>
            </div>
            </div>
          </div>
          <div
            class="branches-panel-resizer"
            title="拖拽调整左栏宽度"
            @pointerdown.prevent="onBranchesPanelResizerPointerDown"
          />

          <!-- 右侧内容区 -->
          <div class="right-panel">
            <!-- 工作区 -->
            <ProjectWorkspace
              v-if="workspaceMounted"
              v-show="currentView === 'workspace'"
              :project-path="path"
              :is-active="isActive && currentView === 'workspace'"
              :git-signature="projectGitMonitorSnapshot?.signature || ''"
              @status-changed="handleFileStatusChanged"
              @pending-count-changed="handlePendingCountChanged"
            />

            <ProjectAiSessions
              v-if="aiSessionsMounted"
              v-show="currentView === 'ai-sessions'"
              :project-path="path"
              @resume-session="handleResumeAiSession"
            />

            <ProjectPipeline
              v-if="currentView === 'pipeline'"
              :project-path="path"
              :is-active="isActive && currentView === 'pipeline'"
            />

            <!-- 提交历史 -->
            <ProjectCommitHistory
              v-if="currentView === 'commit-history'"
              :project-path="path"
              :current-branch="currentBranch"
              :all-branches="allBranches"
              :refresh-token="commitHistoryRefreshToken"
              :execute-command="executeCommand"
              :refresh-branch-status="loadBranches"
              @switch-to-workspace="selectWorkspace"
            />

            <!-- 暂存列表 -->
            <ProjectStashList
              v-if="currentView === 'stash-list'"
              :project-path="path"
              :execute-command="executeCommand"
              ref="stashListRef"
              @switch-to-workspace="selectWorkspace"
            />

            <!-- 终端 - 使用 v-show 保持存活，避免切换时重新创建 -->
            <TerminalPanel
              v-if="terminalMounted && terminalMode === 'split'"
              v-show="currentView === 'terminal'"
              :default-cwd="terminalProjectPath"
              :is-active="isActive && currentView === 'terminal'"
              split-only-mode
              ref="terminalRef"
            />
            <FocusTerminalStack
              v-if="terminalMounted && terminalMode === 'liquid'"
              v-show="currentView === 'terminal'"
              :default-cwd="terminalProjectPath"
              :is-active="isActive && currentView === 'terminal'"
              ref="liquidTerminalRef"
            />

          </div>
        </div>
      </div>
    </div>

    <!-- 操作进度对话框 -->
    <OperationDialog
      :show="showOperationDialog"
      :title="operationType"
      :output="operationOutput"
      :in-progress="operationInProgress"
      @cancel="cancelOperation"
    />

    <!-- 项目设置对话框 -->
    <ProjectSettingsDialog
      v-model:visible="showProjectSettings"
      :project-path="path"
      :terminal-mode="terminalMode"
      @confirm="onProjectSettingsConfirm"
    />

    <!-- 新建分支对话框 -->
    <div v-if="showCreateBranchDialog" class="dialog-overlay">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>新建分支</h3></div>
        <div class="dialog-body">
          <div class="form-group">
            <label>基于分支:</label>
            <CustomSelect v-model="baseBranch" :options="allBranches" placeholder="选择基于的分支" />
          </div>
          <div class="form-group">
            <label>分支名称:</label>
            <input v-model="newBranchName" type="text" placeholder="请输入分支名称" class="branch-input" @keyup.enter="createBranch" />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeCreateBranchDialog">取消</button>
          <button class="confirm-btn-large" @click="createBranch" :disabled="!newBranchName.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 删除分支对话框 -->
    <div v-if="showDeleteBranchDialog" class="dialog-overlay" @click="closeDeleteBranchDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>删除分支</h3></div>
        <div class="dialog-body">
          <p>{{ deleteBranchMessage }}</p>
          <div v-if="showDeleteRemoteOption" class="form-group">
            <label><input type="checkbox" v-model="deleteRemoteBranch" /> 同时删除远程分支</label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeDeleteBranchDialog">取消</button>
          <button class="delete-btn-large" @click="confirmDeleteBranch">删除</button>
        </div>
      </div>
    </div>

    <!-- 合并分支对话框 -->
    <div v-if="showMergeBranchDialog" class="dialog-overlay" @click="closeMergeBranchDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>合并分支</h3></div>
        <div class="dialog-body">
          <p>将分支 <strong>{{ branchToMerge }}</strong> 合并到当前分支 <strong>{{ currentBranch }}</strong></p>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeMergeBranchDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmMergeBranch">合并</button>
        </div>
      </div>
    </div>

    <!-- 创建标签对话框 -->
    <div v-if="showCreateTagDialog" class="dialog-overlay" @click="closeCreateTagDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>创建标签</h3></div>
        <div class="dialog-body">
          <div class="form-group">
            <label>标签名称：</label>
            <input ref="newTagNameInputRef" v-model="newTagName" type="text" placeholder="例如: v1.0.0" class="branch-input" @keyup.enter="confirmCreateTag" />
          </div>
          <div class="form-group">
            <label>标签信息（可选）：</label>
            <textarea v-model="newTagMessage" placeholder="标签描述信息" class="branch-input" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>基于提交（可选）：</label>
            <input v-model="tagCommit" type="text" placeholder="提交hash或分支名" class="branch-input" />
          </div>
          <div class="form-group">
            <label><input type="checkbox" v-model="pushTagAfterCreate" /> 创建后推送到远程</label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeCreateTagDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmCreateTag" :disabled="!newTagName.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 删除标签对话框 -->
    <div v-if="showDeleteTagDialog" class="dialog-overlay" @click="closeDeleteTagDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>删除标签</h3></div>
        <div class="dialog-body">
          <p>确定要删除标签 <strong>{{ tagToDelete }}</strong> 吗？</p>
          <div class="form-group">
            <label><input type="checkbox" v-model="deleteRemoteTag" /> 同时删除远程标签</label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeDeleteTagDialog">取消</button>
          <button class="delete-btn-large" @click="confirmDeleteTag">删除</button>
        </div>
      </div>
    </div>

    <!-- 创建MR对话框 -->
    <div v-if="showCreateMRDialog" class="dialog-overlay">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>创建 Merge Request</h3></div>
        <div class="dialog-body">
          <div class="form-group">
            <label>源分支：</label>
            <CustomSelect v-model="sourceBranchForMR" :options="mrBranchOptions" placeholder="选择源分支" />
          </div>
          <div class="form-group">
            <label>目标分支：</label>
            <CustomSelect v-model="targetBranchForMR" :options="mrBranchOptions" placeholder="选择目标分支" />
          </div>
          <div class="form-group">
            <label>MR标题：</label>
            <input v-model="mrTitle" type="text" placeholder="请输入MR标题" class="branch-input" />
          </div>
          <div class="form-group">
            <label>MR描述（可选）：</label>
            <textarea v-model="mrDescription" placeholder="请输入MR描述" class="mr-description" rows="3"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeMRDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmCreateMR" :disabled="!sourceBranchForMR || !targetBranchForMR || !mrTitle.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 标签右键菜单 -->
    <div v-if="showTagContextMenu" class="context-menu" :style="{ left: tagContextMenuPosition.x + 'px', top: tagContextMenuPosition.y + 'px' }" @click.stop>
      <div class="context-menu-item" @click="copyTagName">复制标签名</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="checkoutTagAction">检出标签</div>
      <div class="context-menu-item" @click="createBranchFromTag">基于标签创建分支</div>
      <div class="context-menu-item" @click="pushTagAction">推送到远程</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="deleteTagAction">删除标签</div>
    </div>

    <!-- 分支右键菜单 -->
    <div v-if="showBranchContextMenuModal" class="context-menu" :style="{ top: branchContextMenuPosition.y + 'px', left: branchContextMenuPosition.x + 'px' }" @click.stop>
      <div class="context-menu-item" @click="copyBranchName">复制分支名</div>
      <div v-if="branchContextMenuType === 'local'" class="context-menu-item" @click="createBranchFromContext">创建分支</div>
      <div v-if="branchContextMenuType === 'remote'" class="context-menu-item" @click="createTagFromRemoteBranch">创建标签</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="checkoutBranchAction">检出分支 {{ branchContextMenuBranch }}</div>
      <div v-if="branchContextMenuType === 'local'" :class="['context-menu-item', { disabled: branchContextMenuBranch === currentBranch }]" @click="mergeBranchAction">
        合并分支 {{ branchContextMenuBranch }} 至 {{ currentBranch }}
      </div>
      <div v-if="branchContextMenuType === 'local'" :class="['context-menu-item', { disabled: branchContextMenuBranch === currentBranch }]" @click="deleteBranchAction">
        删除分支 {{ branchContextMenuBranch }}
      </div>
      <div v-if="branchContextMenuType === 'remote'" class="context-menu-item" @click="deleteRemoteBranchAction">
        删除远程分支 {{ branchContextMenuBranch }}
      </div>
      <div v-if="branchContextMenuType === 'remote'" class="context-menu-item" @click="createMergeRequestFromBranch">
        Merge {{ branchContextMenuBranch }} 到目标分支
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onUnmounted, nextTick, defineAsyncComponent } from 'vue'
import {
  FolderOpen, GitBranch, Tag, GitPullRequest, ArrowUpCircle, GitMerge, Activity,
  Terminal as TerminalIcon, ExternalLink, FileText, History, Archive, Bot,
  FolderTree, Cloud, RefreshCw, Check, ChevronRight, Settings, Star,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-vue-next'
import ProjectStashList from './ProjectStashList.vue'
import ProjectCommitHistory from './ProjectCommitHistory.vue'
import ProjectAiSessions from './ProjectAiSessions.vue'
import ProjectPipeline from './ProjectPipeline.vue'
import OperationDialog from '../dialog/OperationDialog.vue'
import ProjectSettingsDialog from '../dialog/ProjectSettingsDialog.vue'
import TerminalPanel from '../terminal/TerminalPanel.vue'
import FocusTerminalStack from '../terminal/FocusTerminalStack.vue'
import CustomSelect from '../common/CustomSelect.vue'
import { useGitCommand } from '../../composables/useGitCommand'
import {
  buildProjectRefreshPlan,
  deriveBranchStatusState
} from './projectDetailRefresh.mjs'
import {
  buildBranchDeleteCommands,
  buildBranchDeleteDialogPlan
} from './projectDetailBranchDelete.mjs'
import {
  deriveProjectGitMonitorRefreshRequest,
  shouldRunProjectGitMonitor
} from './projectDetailGitMonitor.mjs'
import { resolveTagsViewState } from './projectDetailTagsState.mjs'
import {
  useProjectStore,
  updateProjectDetail,
  updateBranchStatus as storeBranchStatus,
  updateAllBranchStatus as storeAllBranchStatus,
  getProjectDetail,
  getBranchStatus as getStoreBranchStatus
} from '../../stores/projectStore'

const ProjectWorkspace = defineAsyncComponent(() => import('./ProjectWorkspace.vue'))

const isDev = import.meta.env.DEV
const normalizeLogArg = (arg) => {
  if (arg == null) return arg
  const type = typeof arg
  if (type === 'string' || type === 'number' || type === 'boolean') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  if (Array.isArray(arg)) return `[Array(${arg.length})]`
  if (type === 'object') {
    try {
      const keys = Object.keys(arg)
      const preview = keys.slice(0, 8).join(', ')
      return `{${preview}${keys.length > 8 ? ', ...' : ''}}`
    } catch (e) {
      return '[Object]'
    }
  }
  return String(arg)
}
const debugLog = (...args) => {
  if (isDev) {
    try {
      console.log(...args.map(normalizeLogArg))
    } catch (error) {
      console.log('[debugLog]', '日志输出失败')
    }
  }
}

// 使用 Git 命令 composable
const {
  operationInProgress,
  operationCancelled,
  operationOutput,
  executeCommand,
  executeCommandWithProgress,
  cancelOperation: baseCancelOperation,
  startOperation,
  appendOutput
} = useGitCommand()

// ==================== Props ====================
const props = defineProps({
  path: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFavorite: {
    type: Boolean,
    default: false
  }
})

const platform = window.electronAPI?.platform || 'darwin'
const systemFileManagerLabel = computed(() => {
  if (platform === 'win32') return '资源管理器'
  if (platform === 'darwin') return '访达'
  return '文件管理器'
})

// ==================== Emits ====================
const emit = defineEmits([
  'branchChanged',    // 分支切换时通知
  'statusUpdated',    // 状态更新时通知 (remoteAhead, localAhead)
  'navigate',         // 需要在新标签打开 URL
  'pendingStatusChanged', // 待定文件状态变化时通知（提交后刷新项目列表）
  'toggleFavorite'
])

// ==================== Refs ====================
const fileStatusRef = ref(null)
const stashListRef = ref(null)
const terminalRef = ref(null)
const liquidTerminalRef = ref(null)
const newTagNameInputRef = ref(null)

/** 传给嵌入式终端的项目根（解码 git: 路由里可能出现的 %20 等），保证主进程拿到真实绝对路径 */
const terminalProjectPath = computed(() => {
  const p = props.path
  if (!p || typeof p !== 'string') return ''
  try {
    return decodeURIComponent(p.trim())
  } catch {
    return p.trim()
  }
})

// ==================== 基础状态 ====================
const projectInfo = ref(null)
const currentBranch = ref('')
const allBranches = ref([])
const remoteBranches = ref([])
const tags = ref([])
const branchStatus = ref(null)
const allBranchStatus = ref({})
const statusLoading = ref(false)
const hasPendingFiles = ref(false) // 是否有待定文件
const isGitRepository = ref(null)
const projectGitMonitorSnapshot = ref(null)
const isDocumentVisible = ref(typeof document === 'undefined' ? true : document.visibilityState === 'visible')
const activePipelineSummary = ref(null)

const PROJECT_GIT_MONITOR_INTERVAL_MS = 2000
const PIPELINE_SUMMARY_ACTIVE_INTERVAL_MS = 8000
const PIPELINE_SUMMARY_IDLE_INTERVAL_MS = 20000
const PIPELINE_SUMMARY_TERMINAL_HOLD_MS = 12000
let projectGitMonitorTimer = null
let projectGitMonitorInFlight = false
let pipelineSummaryTimer = null
let pipelineSummaryHoldUntil = 0

// ==================== UI 状态 ====================
/** 主进程 electron-store（get-config / set-config），无 Electron 时不持久化 */
const getProjectViewKey = (path) => `projectView_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`
const getExpandStateKey = (path) => `expandState_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`
const getBranchesPanelWidthKey = (path) =>
  `projectBranchesPanelWidth_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`
const getBranchesPanelLastExpandedKey = (path) =>
  `projectBranchesPanelLastExpanded_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`

const projectUiConfigViaElectron = () =>
  typeof window !== 'undefined' &&
  typeof window.electronAPI?.getConfig === 'function' &&
  typeof window.electronAPI?.setConfig === 'function'

async function getConfigString (key) {
  if (!projectUiConfigViaElectron()) return null
  const v = await window.electronAPI.getConfig(key)
  if (v !== undefined && v !== null && String(v).length > 0) return String(v)
  return null
}

async function setConfigString (key, str) {
  if (!projectUiConfigViaElectron()) return
  await window.electronAPI.setConfig(key, String(str)).catch(() => {})
}

async function getConfigObject (key) {
  if (!projectUiConfigViaElectron()) return null
  const v = await window.electronAPI.getConfig(key)
  if (v && typeof v === 'object' && !Array.isArray(v)) return v
  if (typeof v === 'string' && v.length > 0) {
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  return null
}

async function setConfigObject (key, obj) {
  if (!projectUiConfigViaElectron()) return
  await window.electronAPI.setConfig(key, obj).catch(() => {})
}

async function getConfigNumber (key) {
  if (!projectUiConfigViaElectron()) return null
  const v = await window.electronAPI.getConfig(key)
  if (v !== undefined && v !== null && v !== '') {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

async function setConfigNumber (key, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return
  if (!projectUiConfigViaElectron()) return
  await window.electronAPI.setConfig(key, n).catch(() => {})
}

/** 拖拽可拖到的最窄宽度（仅图标条） */
const BRANCHES_PANEL_RAIL_MIN = 48
/** 从图标条点「本地/远程分支」恢复后的可读最小宽度 */
const BRANCHES_PANEL_READABLE_MIN = 200
const BRANCHES_PANEL_MAX = 560
const BRANCHES_PANEL_DEFAULT = 240
/** 小于等于此宽度时隐藏侧栏文字，仅保留图标（悬停 title 显示全称） */
const BRANCHES_PANEL_ICON_RAIL_BREAKPOINT = 100

const getSavedCurrentView = async (path) => {
  try {
    const saved = await getConfigString(getProjectViewKey(path))
    if (saved === 'file-status') return 'workspace'
    if (saved && ['commit-history', 'stash-list', 'terminal', 'ai-sessions', 'pipeline', 'workspace'].includes(saved)) {
      if (saved === 'terminal') return 'ai-sessions'
      return saved
    }
  } catch (e) {}
  return 'ai-sessions'
}

const getProjectTerminalModeKey = (path) =>
  `projectTerminalMode_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`

const getSavedTerminalMode = async (path) => {
  try {
    const saved = await getConfigString(getProjectTerminalModeKey(path))
    if (saved === 'liquid') return 'liquid'
  } catch (e) {}
  return 'split'
}

const saveExpandState = () => {
  if (!props.path) return
  void (async () => {
    await setConfigObject(getExpandStateKey(props.path), {
      localBranches: showLocalBranches.value,
      remoteBranches: showRemoteBranches.value,
      tags: showTags.value
    })
  })().catch(() => {})
}

const restoreExpandState = async (path) => {
  try {
    const state = await getConfigObject(getExpandStateKey(path))
    if (state && typeof state === 'object') {
      showLocalBranches.value = state.localBranches ?? true
      showRemoteBranches.value = state.remoteBranches ?? false
      showTags.value = state.tags ?? false
    } else {
      showLocalBranches.value = true
      showRemoteBranches.value = false
      showTags.value = false
    }
  } catch (e) {
    showLocalBranches.value = true
    showRemoteBranches.value = false
    showTags.value = false
  }
}

const currentView = ref('ai-sessions')
const terminalMode = ref('split')
const branchesPanelWidthPx = ref(BRANCHES_PANEL_DEFAULT)
/** 用户上次拉宽后的宽度，用于从图标条恢复 */
const branchesPanelLastExpandedWidth = ref(BRANCHES_PANEL_DEFAULT)

const isBranchesPanelIconRail = computed(
  () => branchesPanelWidthPx.value <= BRANCHES_PANEL_ICON_RAIL_BREAKPOINT
)

async function loadBranchesPanelLastExpanded (path) {
  if (!path) {
    branchesPanelLastExpandedWidth.value = BRANCHES_PANEL_DEFAULT
    return
  }
  const n = await getConfigNumber(getBranchesPanelLastExpandedKey(path))
  if (n !== null && n >= BRANCHES_PANEL_READABLE_MIN && n <= BRANCHES_PANEL_MAX) {
    branchesPanelLastExpandedWidth.value = Math.round(n)
  } else {
    branchesPanelLastExpandedWidth.value = BRANCHES_PANEL_DEFAULT
  }
}

async function loadBranchesPanelWidth (path) {
  if (!path) {
    branchesPanelWidthPx.value = BRANCHES_PANEL_DEFAULT
    return
  }
  await loadBranchesPanelLastExpanded(path)
  const n = await getConfigNumber(getBranchesPanelWidthKey(path))
  if (n !== null && n >= BRANCHES_PANEL_RAIL_MIN && n <= BRANCHES_PANEL_MAX) {
    const w = Math.round(n)
    branchesPanelWidthPx.value = w
    if (w > BRANCHES_PANEL_ICON_RAIL_BREAKPOINT) {
      branchesPanelLastExpandedWidth.value = w
    }
  } else {
    branchesPanelWidthPx.value = BRANCHES_PANEL_DEFAULT
  }
}

async function persistBranchesPanelWidth () {
  if (!props.path) return
  const w = branchesPanelWidthPx.value
  await setConfigNumber(getBranchesPanelWidthKey(props.path), w)
  if (w > BRANCHES_PANEL_ICON_RAIL_BREAKPOINT) {
    branchesPanelLastExpandedWidth.value = w
    await setConfigNumber(getBranchesPanelLastExpandedKey(props.path), w)
  }
}

function saveBranchesPanelWidth () {
  void persistBranchesPanelWidth().catch(() => {})
}

/** 图标条模式下点击「本地分支 / 远程分支」标题时恢复侧栏可读宽度 */
function expandSidePanelFromIconRail () {
  if (branchesPanelWidthPx.value > BRANCHES_PANEL_ICON_RAIL_BREAKPOINT) return
  const target = Math.min(
    BRANCHES_PANEL_MAX,
    Math.max(
      BRANCHES_PANEL_READABLE_MIN,
      branchesPanelLastExpandedWidth.value || BRANCHES_PANEL_DEFAULT
    )
  )
  branchesPanelWidthPx.value = target
  saveBranchesPanelWidth()
}

/** 分割条上的快捷收起 / 展开（与拖窄进图标条一致） */
function toggleBranchesPanelRail () {
  if (isBranchesPanelIconRail.value) {
    expandSidePanelFromIconRail()
  } else {
    branchesPanelWidthPx.value = BRANCHES_PANEL_RAIL_MIN
    saveBranchesPanelWidth()
  }
}

let branchesPanelWidthSaveThrottleTimer = null
function scheduleBranchesPanelWidthSaveThrottled () {
  if (!props.path) return
  if (branchesPanelWidthSaveThrottleTimer) return
  branchesPanelWidthSaveThrottleTimer = setTimeout(() => {
    branchesPanelWidthSaveThrottleTimer = null
    saveBranchesPanelWidth()
  }, 200)
}

function onBranchesPanelResizerPointerDown (e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const el = e.currentTarget
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  const startX = e.clientX
  const startW = branchesPanelWidthPx.value
  const onMove = (ev) => {
    const d = ev.clientX - startX
    branchesPanelWidthPx.value = Math.min(
      BRANCHES_PANEL_MAX,
      Math.max(BRANCHES_PANEL_RAIL_MIN, startW + d)
    )
    scheduleBranchesPanelWidthSaveThrottled()
  }
  const onUp = (ev) => {
    try {
      el.releasePointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    if (branchesPanelWidthSaveThrottleTimer) {
      clearTimeout(branchesPanelWidthSaveThrottleTimer)
      branchesPanelWidthSaveThrottleTimer = null
    }
    saveBranchesPanelWidth()
  }
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}

const terminalMounted = ref(false)
const aiSessionsMounted = ref(false)
const workspaceMounted = ref(false)
const showLocalBranches = ref(true)
const showRemoteBranches = ref(false)
const showTags = ref(false)
const tagsLoading = ref(false)
const tagsRefreshing = ref(false)
const tagsRefreshSuccess = ref(false)
const commitHistoryRefreshToken = ref(0)
const refreshing = ref(false)
const refreshSuccess = ref(false)
let aiSessionsPreloadHandle = null
let workspacePreloadHandle = null

const clearAiSessionsPreload = () => {
  if (aiSessionsPreloadHandle == null || typeof window === 'undefined') return

  if (typeof aiSessionsPreloadHandle === 'number') {
    window.clearTimeout(aiSessionsPreloadHandle)
  } else if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(aiSessionsPreloadHandle)
  }

  aiSessionsPreloadHandle = null
}

const clearWorkspacePreload = () => {
  if (workspacePreloadHandle == null || typeof window === 'undefined') return

  if (typeof workspacePreloadHandle === 'number') {
    window.clearTimeout(workspacePreloadHandle)
  } else if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(workspacePreloadHandle)
  }

  workspacePreloadHandle = null
}

const scheduleAiSessionsPreload = () => {
  if (aiSessionsMounted.value || typeof window === 'undefined') return

  clearAiSessionsPreload()

  const mountAiSessions = () => {
    aiSessionsPreloadHandle = null
    aiSessionsMounted.value = true
  }

  if (typeof window.requestIdleCallback === 'function') {
    aiSessionsPreloadHandle = window.requestIdleCallback(mountAiSessions, { timeout: 600 })
    return
  }

  aiSessionsPreloadHandle = window.setTimeout(mountAiSessions, 0)
}

const scheduleWorkspacePreload = () => {
  if (workspaceMounted.value || typeof window === 'undefined') return

  clearWorkspacePreload()

  const mountWorkspace = () => {
    workspacePreloadHandle = null
    workspaceMounted.value = true
  }

  if (typeof window.requestIdleCallback === 'function') {
    workspacePreloadHandle = window.requestIdleCallback(mountWorkspace, { timeout: 600 })
    return
  }

  workspacePreloadHandle = window.setTimeout(mountWorkspace, 0)
}

// ==================== 操作对话框 ====================
const showOperationDialog = ref(false)
const operationType = ref('')

// ==================== 新建分支对话框 ====================
const showCreateBranchDialog = ref(false)
const baseBranch = ref('')
const newBranchName = ref('')

// ==================== 删除分支对话框 ====================
const showDeleteBranchDialog = ref(false)
const branchToDelete = ref('')
const deleteLocalBranch = ref(true)
const deleteRemoteBranch = ref(false)
const deleteBranchMessage = ref('')
const deleteBranchOperationText = ref('')
const showDeleteRemoteOption = ref(true)

// ==================== 合并分支对话框 ====================
const showMergeBranchDialog = ref(false)
const branchToMerge = ref('')

// ==================== 创建标签对话框 ====================
const showCreateTagDialog = ref(false)
const newTagName = ref('')
const newTagMessage = ref('')
const tagCommit = ref('')
const pushTagAfterCreate = ref(true)

// ==================== 删除标签对话框 ====================
const showDeleteTagDialog = ref(false)
const tagToDelete = ref('')
const deleteRemoteTag = ref(false)

// ==================== 标签右键菜单 ====================
const showTagContextMenu = ref(false)
const tagContextMenuPosition = ref({ x: 0, y: 0 })
const tagContextMenuTag = ref(null)

// ==================== 分支右键菜单 ====================
const showBranchContextMenuModal = ref(false)
const branchContextMenuPosition = ref({ x: 0, y: 0 })
const branchContextMenuBranch = ref('')
const branchContextMenuType = ref('local')

// ==================== 创建MR对话框 ====================
const showCreateMRDialog = ref(false)
const sourceBranchForMR = ref('')
const targetBranchForMR = ref('')
const mrTitle = ref('')
const mrDescription = ref('')

// ==================== 项目设置对话框 ====================
const showProjectSettings = ref(false)

// ==================== 计算属性 ====================
const pullTitle = computed(() => {
  return branchStatus.value?.remoteAhead > 0 
    ? `拉取 ${branchStatus.value.remoteAhead} 个新提交` 
    : '拉取远程更新'
})

const pushTitle = computed(() => {
  return branchStatus.value?.localAhead > 0 
    ? `推送 ${branchStatus.value.localAhead} 个本地提交` 
    : '推送本地提交'
})

const mrBranchOptions = computed(() => {
  const branches = [...allBranches.value]
  const remote = remoteBranches.value.map(b => b.replace('origin/', ''))
  return [...new Set([...branches, ...remote])]
})

const tagsViewState = computed(() => resolveTagsViewState({
  tagsLoading: tagsLoading.value,
  tags: tags.value
}))

const STABLE_SEMVER_TAG_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/

const parseStableSemverTag = (tagName) => {
  if (typeof tagName !== 'string') return null
  const normalized = tagName.trim()
  const match = normalized.match(STABLE_SEMVER_TAG_PATTERN)
  if (!match) return null

  return {
    raw: tagName,
    normalized,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

const compareStableSemverTag = (left, right) => {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

const getLargestStableSemverTagName = () => {
  const candidates = tags.value
    .map(tag => parseStableSemverTag(tag?.name || ''))
    .filter(Boolean)

  if (candidates.length === 0) return ''

  candidates.sort(compareStableSemverTag)
  return candidates[candidates.length - 1]?.normalized || ''
}

const pipelineStatusClass = computed(() => `pipeline-status-${activePipelineSummary.value?.status || 'unknown'}`)

const pipelineStatusText = computed(() => {
  const pipeline = activePipelineSummary.value
  if (!pipeline) return ''
  const refText = pipeline.isTag ? `标签 ${pipeline.ref}` : `分支 ${pipeline.ref}`
  if (pipeline.status === 'success') return `刚刚成功 · ${refText}`
  if (pipeline.status === 'failed') return `执行失败 · ${refText}`
  if (pipeline.status === 'canceled') return `已取消 · ${refText}`
  return `执行中 · ${refText}`
})

const pipelineStatusTitle = computed(() => {
  const pipeline = activePipelineSummary.value
  if (!pipeline) return ''
  return `当前运行中的 GitLab Pipeline：${pipelineStatusText.value}`
})

// ==================== 辅助方法 ====================
const getAllBranchStatus = (branch) => {
  return allBranchStatus.value?.[branch] || null
}

const emitBranchChanged = (projectPath, branch) => {
  if (!projectPath) return
  emit('branchChanged', { path: projectPath, branch })
}

const emitStatusUpdated = (projectPath, status = {}) => {
  if (!projectPath) return
  emit('statusUpdated', {
    path: projectPath,
    remoteAhead: status.remoteAhead || 0,
    localAhead: status.localAhead || 0
  })
}

const emitPendingStatusChanged = (projectPath, hasPending = hasPendingFiles.value) => {
  if (!projectPath) return
  emit('pendingStatusChanged', {
    path: projectPath,
    hasPendingFiles: !!hasPending
  })
}

const syncHasPendingFiles = (nextValue, { emitWhenChanged = true } = {}) => {
  const normalized = Boolean(nextValue)
  const changed = hasPendingFiles.value !== normalized
  hasPendingFiles.value = normalized
  if (changed && emitWhenChanged) {
    emitPendingStatusChanged(props.path, normalized)
  }
  return changed
}

const getPipelineInlineRef = (pipeline) => {
  if (!pipeline?.ref) return ''
  return pipeline.isTag ? `标签 ${pipeline.ref}` : pipeline.ref
}

const clearPipelineSummaryTimer = () => {
  if (pipelineSummaryTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(pipelineSummaryTimer)
  }
  pipelineSummaryTimer = null
}

const isActivePipelineStatus = (status) => {
  return ['running', 'pending', 'preparing', 'waiting_for_resource', 'created'].includes(status)
}

const isTerminalPipelineStatus = (status) => {
  return ['success', 'failed', 'canceled'].includes(status)
}

const schedulePipelineSummaryRefresh = () => {
  clearPipelineSummaryTimer()
  if (!props.isActive || !props.path || isGitRepository.value === false || !isDocumentVisible.value || typeof window === 'undefined') {
    return
  }

  let delay = activePipelineSummary.value
    ? PIPELINE_SUMMARY_ACTIVE_INTERVAL_MS
    : PIPELINE_SUMMARY_IDLE_INTERVAL_MS

  if (pipelineSummaryHoldUntil > Date.now()) {
    delay = Math.min(delay, Math.max(500, pipelineSummaryHoldUntil - Date.now()))
  }

  pipelineSummaryTimer = window.setTimeout(() => {
    pipelineSummaryTimer = null
    refreshPipelineSummary({ silent: true })
  }, delay)
}

const refreshPipelineSummary = async ({ silent = false } = {}) => {
  if (!props.path || isGitRepository.value === false || !window.electronAPI?.gitlabProjectPipelines) {
    activePipelineSummary.value = null
    return
  }

  try {
    const result = await window.electronAPI.gitlabProjectPipelines({
      projectPath: props.path,
      limit: 8
    })

    if (!result?.success) {
      if (!silent) {
        debugLog('ℹ️ [ProjectDetailNew] GitLab Pipeline 摘要不可用:', result?.message)
      }
      activePipelineSummary.value = null
      pipelineSummaryHoldUntil = 0
      return
    }

    const previousSummary = activePipelineSummary.value
    const currentRunning = result.data?.currentRunning || null
    const latestRecent = result.data?.recentPipelines?.[0] || null

    if (currentRunning) {
      activePipelineSummary.value = currentRunning
      pipelineSummaryHoldUntil = 0
    } else if (
      previousSummary &&
      isActivePipelineStatus(previousSummary.status) &&
      isTerminalPipelineStatus(latestRecent?.status)
    ) {
      activePipelineSummary.value = latestRecent
      pipelineSummaryHoldUntil = Date.now() + PIPELINE_SUMMARY_TERMINAL_HOLD_MS
    } else if (
      isTerminalPipelineStatus(activePipelineSummary.value?.status) &&
      pipelineSummaryHoldUntil > Date.now()
    ) {
      // 保持结束态直到延迟窗口结束
    } else {
      activePipelineSummary.value = null
      pipelineSummaryHoldUntil = 0
    }
  } catch (error) {
    if (!silent) {
      debugLog('ℹ️ [ProjectDetailNew] 刷新 GitLab Pipeline 摘要失败:', error.message)
    }
    if (!(isTerminalPipelineStatus(activePipelineSummary.value?.status) && pipelineSummaryHoldUntil > Date.now())) {
      activePipelineSummary.value = null
      pipelineSummaryHoldUntil = 0
    }
  } finally {
    schedulePipelineSummaryRefresh()
  }
}

const markRefreshSuccess = (target) => {
  target.value = true
  window.setTimeout(() => {
    target.value = false
  }, 1500)
}

const clearProjectBranchStatusCache = async (projectPath) => {
  if (!projectPath || !window.electronAPI?.clearBranchStatusCache) return
  try {
    await window.electronAPI.clearBranchStatusCache({ path: projectPath })
  } catch (error) {
    console.warn('清除分支状态缓存失败:', error)
  }
}

const openOperationDialog = (type, initialOutput = '') => {
  showOperationDialog.value = true
  operationType.value = type
  startOperation(initialOutput)
}

const appendProgressOutput = (output) => {
  appendOutput(output)
}

const finishOperation = ({ hideDialog = false } = {}) => {
  operationInProgress.value = false
  if (hideDialog) {
    showOperationDialog.value = false
  }
}

const bumpCommitHistoryRevision = () => {
  commitHistoryRefreshToken.value += 1
}

const shouldPollProjectGitMonitor = computed(() => shouldRunProjectGitMonitor({
  path: props.path,
  isActive: props.isActive,
  isVisible: isDocumentVisible.value
}))

const detectGitRepository = async (targetPath = props.path) => {
  if (!targetPath) {
    isGitRepository.value = false
    return false
  }

  try {
    const result = await executeCommand(`cd "${targetPath}" && git rev-parse --is-inside-work-tree 2>/dev/null`)
    const isGit = Boolean(result?.success && result?.output?.trim() === 'true')
    if (props.path === targetPath) {
      isGitRepository.value = isGit
    }
    return isGit
  } catch (error) {
    if (props.path === targetPath) {
      isGitRepository.value = false
    }
    return false
  }
}

const resetProjectGitMonitorState = () => {
  projectGitMonitorSnapshot.value = null
  projectGitMonitorInFlight = false
}

const stopProjectGitMonitor = () => {
  if (projectGitMonitorTimer != null) {
    window.clearInterval(projectGitMonitorTimer)
    projectGitMonitorTimer = null
  }
  projectGitMonitorInFlight = false
}

const pollProjectGitMonitor = async () => {
  if (
    !window.electronAPI?.getProjectGitMonitorSnapshot ||
    !shouldPollProjectGitMonitor.value ||
    projectGitMonitorInFlight ||
    isGitRepository.value === false
  ) {
    return
  }

  const currentPath = props.path
  if (!currentPath) return

  projectGitMonitorInFlight = true

  try {
    const result = await window.electronAPI.getProjectGitMonitorSnapshot({ path: currentPath })

    if (
      !isCurrentProjectPath(currentPath) ||
      !shouldRunProjectGitMonitor({
        path: currentPath,
        isActive: props.isActive,
        isVisible: isDocumentVisible.value
      })
    ) {
      return
    }

    if (!result?.success || !result.data) {
      return
    }

    const previousSnapshot = projectGitMonitorSnapshot.value
    const nextSnapshot = result.data
    projectGitMonitorSnapshot.value = nextSnapshot
    syncHasPendingFiles(
      (nextSnapshot.changedCount || 0) > 0 ||
      (nextSnapshot.stagedCount || 0) > 0 ||
      (nextSnapshot.untrackedCount || 0) > 0 ||
      (nextSnapshot.conflictedCount || 0) > 0
    )

    const refreshRequest = deriveProjectGitMonitorRefreshRequest(
      previousSnapshot,
      nextSnapshot
    )

    if (refreshRequest) {
      debugLog('🔄 [ProjectDetailNew] Git monitor detected change:', nextSnapshot.signature)
      queueProjectRefresh(refreshRequest)
    }
  } catch (error) {
    console.warn('项目 Git 监控轮询失败:', error)
  } finally {
    projectGitMonitorInFlight = false
  }
}

const startProjectGitMonitor = () => {
  stopProjectGitMonitor()

  if (!shouldPollProjectGitMonitor.value || isGitRepository.value === false) {
    return
  }

  pollProjectGitMonitor()
  projectGitMonitorTimer = window.setInterval(() => {
    pollProjectGitMonitor()
  }, PROJECT_GIT_MONITOR_INTERVAL_MS)
}

const queueProjectRefresh = ({
  reloadBranches = false,
  reloadBranchStatus = false,
  reloadFileStatus = false,
  preserveFileStatus = false,
  reloadTags = false,
  reloadCommitHistory = false
} = {}) => {
  const projectPath = props.path
  if (!projectPath || isGitRepository.value === false) return

  const refreshPlan = buildProjectRefreshPlan({
    reloadBranches,
    reloadBranchStatus,
    reloadFileStatus,
    preserveFileStatus,
    reloadTags,
    reloadCommitHistory
  }, {
    showTags: showTags.value
  })

  ;(async () => {
    try {
      await clearProjectBranchStatusCache(projectPath)

      const tasks = []

      if (refreshPlan.reloadBranches) {
        tasks.push(loadBranches())
      } else if (refreshPlan.reloadBranchStatus) {
        tasks.push(loadBranchStatus())
      }

      if (refreshPlan.reloadTags) {
        tasks.push(loadTags())
      }

      if (tasks.length > 0) {
        const results = await Promise.allSettled(tasks)
        results
          .filter(result => result.status === 'rejected')
          .forEach(result => {
            console.error('刷新子任务失败:', result.reason)
          })
      }

      if (refreshPlan.reloadFileStatus) {
        fileStatusRef.value?.loadFileStatus?.(refreshPlan.preserveFileStatus)
      }

      if (refreshPlan.reloadCommitHistory) {
        bumpCommitHistoryRevision()
      }
    } catch (error) {
      console.error('刷新状态失败:', error)
    }
  })()
}

// ==================== 项目加载 ====================
const loadCurrentBranchQuick = async () => {
  if (!props.path) return

  const currentPath = props.path

  try {
    const branchResult = await executeCommand(
      `cd "${currentPath}" && git branch --show-current 2>/dev/null`
    )

    if (!isCurrentProjectPath(currentPath)) {
      debugLog('⚠️ [loadCurrentBranchQuick] 项目已切换，丢弃旧数据')
      return
    }

    let nextBranch = branchResult.success ? branchResult.output?.trim() || '' : ''

    if (!nextBranch) {
      const tagResult = await executeCommand(
        `cd "${currentPath}" && git describe --tags --exact-match HEAD 2>/dev/null`
      )

      if (!isCurrentProjectPath(currentPath)) {
        debugLog('⚠️ [loadCurrentBranchQuick] 项目已切换，丢弃旧数据')
        return
      }

      if (tagResult.success && tagResult.output?.trim()) {
        nextBranch = `HEAD detached at ${tagResult.output.trim()}`
      } else {
        const commitResult = await executeCommand(
          `cd "${currentPath}" && git rev-parse --short HEAD 2>/dev/null`
        )

        if (!isCurrentProjectPath(currentPath)) {
          debugLog('⚠️ [loadCurrentBranchQuick] 项目已切换，丢弃旧数据')
          return
        }

        nextBranch = commitResult.success && commitResult.output?.trim()
          ? `HEAD detached at ${commitResult.output.trim()}`
          : 'HEAD detached'
      }
    }

    if (nextBranch && currentBranch.value !== nextBranch) {
      currentBranch.value = nextBranch
      updateProjectDetail(currentPath, { currentBranch: nextBranch })
      emitBranchChanged(currentPath, nextBranch)
    }
  } catch (error) {
    console.error('快速加载当前分支失败:', error)
  }
}

const loadProjectInfo = ({
  forceRefreshRemoteBranches = false,
  forceRefreshTags = false,
  refreshBranchStatus = true
} = {}) => {
  if (!props.path) {
    projectInfo.value = null
    return
  }
  
  // 从路径提取项目名（同步操作，立即显示）
  const pathParts = props.path.split('/')
  const name = pathParts[pathParts.length - 1]
  
  projectInfo.value = {
    path: props.path,
    name: name
  }

  setTimeout(() => {
    if (isGitRepository.value === false) return
    loadCurrentBranchQuick().catch(err => console.error('快速加载当前分支失败:', err))
    loadLocalBranches().catch(err => console.error('加载本地分支失败:', err))

    if (refreshBranchStatus) {
      loadBranchStatus().catch(err => console.error('加载分支状态失败:', err))
    }

    if (
      showRemoteBranches.value &&
      (forceRefreshRemoteBranches || remoteBranches.value.length === 0) &&
      !refreshing.value
    ) {
      loadRemoteBranches().catch(err => console.error('加载远程分支失败:', err))
    }

    if (
      showTags.value &&
      (forceRefreshTags || tags.value.length === 0) &&
      !tagsLoading.value
    ) {
      loadTags().catch(err => console.error('加载标签失败:', err))
    }
  }, 0)
}

const isCurrentProjectPath = (path) => !!path && props.path === path

const fetchCurrentBranchListData = async (label) => {
  const currentPath = props.path
  if (!currentPath) return null

  const result = await window.electronAPI.getBranchList({ path: currentPath })
  if (!isCurrentProjectPath(currentPath)) {
    debugLog(`⚠️ [${label}] 项目已切换，丢弃旧数据`)
    return null
  }

  if (!result.success || !result.data) {
    return { currentPath, data: null }
  }

  return {
    currentPath,
    data: result.data
  }
}

const applyBranchListData = (currentPath, data, {
  includeLocal = false,
  includeRemote = false,
  triggerPendingCheck = false,
  triggerBranchStatusRefresh = false
} = {}) => {
  if (!currentPath || !data) return

  const localBranches = data.all || []
  const remoteBranchList = data.remote || []
  const activeBranch = data.current || 'unknown'
  const storePayload = {}

  if (includeLocal) {
    allBranches.value = localBranches
    currentBranch.value = activeBranch
    storePayload.localBranches = localBranches
    storePayload.currentBranch = data.current || ''
    emitBranchChanged(currentPath, currentBranch.value)
  }

  if (includeRemote) {
    remoteBranches.value = remoteBranchList
    storePayload.remoteBranches = remoteBranchList
  }

  if (Object.keys(storePayload).length > 0) {
    updateProjectDetail(currentPath, storePayload)
  }

  if (triggerPendingCheck) {
    checkPendingFiles()
  }

  if (triggerBranchStatusRefresh && allBranches.value.length > 0 && !currentBranch.value.includes('HEAD detached')) {
    loadBranchStatus()
  }
}

// 检查是否有待定文件
const checkPendingFiles = async () => {
  if (!props.path) return
  
  const currentPath = props.path // 保存当前路径，用于检查是否切换了项目
  
  try {
    const result = await executeCommand(`cd "${currentPath}" && git status --porcelain`)
    
    // 检查项目是否已切换，如果切换了则不更新数据
    if (props.path !== currentPath) {
      debugLog('⚠️ [checkPendingFiles] 项目已切换，丢弃旧数据')
      return
    }
    
    if (result.success) {
      const output = result.output?.trim() || ''
      syncHasPendingFiles(output.length > 0)
    }
  } catch (error) {
    console.error('检查待定文件失败:', error)
  }
}

const loadLocalBranches = async () => {
  try {
    const snapshot = await fetchCurrentBranchListData('loadLocalBranches')
    if (!snapshot?.data) return

    applyBranchListData(snapshot.currentPath, snapshot.data, {
      includeLocal: true,
      triggerPendingCheck: true
    })
  } catch (error) {
    console.error('加载本地分支列表失败:', error)
  }
}

const loadRemoteBranches = async () => {
  if (!props.path || refreshing.value) return
  refreshing.value = true
  
  try {
    const snapshot = await fetchCurrentBranchListData('loadRemoteBranches')
    if (!snapshot?.data) return

    applyBranchListData(snapshot.currentPath, snapshot.data, {
      includeRemote: true
    })
  } catch (error) {
    console.error('加载远程分支列表失败:', error)
  } finally {
    refreshing.value = false
  }
}

const loadBranches = async () => {
  try {
    const snapshot = await fetchCurrentBranchListData('loadBranches')
    if (!snapshot?.data) return

    applyBranchListData(snapshot.currentPath, snapshot.data, {
      includeLocal: true,
      includeRemote: true,
      triggerBranchStatusRefresh: true
    })
  } catch (error) {
    console.error('加载分支列表失败:', error)
  }
}

const loadBranchStatus = async () => {
  if (!props.path) return

  const currentPath = props.path // 保存当前路径，用于检查是否切换了项目
  statusLoading.value = true

  try {
    const result = await window.electronAPI.getBranchStatus({ path: currentPath })

    // 检查项目是否已切换，如果切换了则不更新数据
    if (props.path !== currentPath) {
      debugLog('⚠️ [loadBranchStatus] 项目已切换，丢弃旧数据')
      return
    }

    if (result.success && result.data) {
      const nextState = deriveBranchStatusState({
        existingCurrentBranch: currentBranch.value,
        statusPayload: result.data
      })

      branchStatus.value = nextState.branchStatus
      allBranchStatus.value = nextState.allBranchStatus

      if (nextState.currentBranch && currentBranch.value !== nextState.currentBranch) {
        currentBranch.value = nextState.currentBranch
        updateProjectDetail(currentPath, { currentBranch: nextState.currentBranch })
        emitBranchChanged(currentPath, nextState.currentBranch)
      }
      
      // 同步到 store
      if (branchStatus.value) {
        storeBranchStatus(currentPath, branchStatus.value)
      }
      if (Object.keys(nextState.allBranchStatus).length > 0) {
        storeAllBranchStatus(currentPath, nextState.allBranchStatus)
      }
      
      // 通知父组件状态更新
      if (branchStatus.value) {
        emitStatusUpdated(currentPath, branchStatus.value)
      }
    }
  } catch (error) {
    console.error('加载分支状态失败:', error)
  } finally {
    statusLoading.value = false
  }
}

const loadTags = async () => {
  if (!props.path || tagsLoading.value) return

  const currentPath = props.path
  
  tagsLoading.value = true
  
  try {
    const localResult = await executeCommand(`cd "${currentPath}" && git tag -l`)
    const localTags = localResult.success && localResult.output?.trim() 
      ? localResult.output.trim().split('\n').filter(t => t)
      : []
    
    const remoteResult = await executeCommand(`cd "${currentPath}" && git ls-remote --tags origin 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||' | sed 's/\\^{}//' | sort -u`)
    const remoteTags = remoteResult.success && remoteResult.output?.trim()
      ? remoteResult.output.trim().split('\n').filter(t => t)
      : []

    if (!isCurrentProjectPath(currentPath)) {
      debugLog('⚠️ [loadTags] 项目已切换，丢弃旧数据')
      return
    }
    
    tags.value = [...new Set([...localTags, ...remoteTags])].map(name => ({
      name,
      isRemote: remoteTags.includes(name),
      isLocal: localTags.includes(name)
    })).sort((a, b) => a.name.localeCompare(b.name))
    
    // 同步到 store
    updateProjectDetail(currentPath, { tags: tags.value })
  } catch (error) {
    console.error('加载标签失败:', error)
    if (isCurrentProjectPath(currentPath)) {
      tags.value = []
    }
    throw error
  } finally {
    if (isCurrentProjectPath(currentPath)) {
      tagsLoading.value = false
    }
  }
}

const refreshTags = async () => {
  if (!props.path || tagsRefreshing.value || tagsLoading.value) return

  tagsRefreshing.value = true
  tagsRefreshSuccess.value = false

  try {
    await loadTags()
    markRefreshSuccess(tagsRefreshSuccess)
  } catch (error) {
    console.error('刷新标签失败:', error)
  } finally {
    tagsRefreshing.value = false
  }
}

// ==================== 视图切换 ====================
const saveCurrentView = (view) => {
  if (!props.path) return
  void setConfigString(getProjectViewKey(props.path), view).catch(() => {})
}

const selectAiSessions = () => {
  currentView.value = 'ai-sessions'
  saveCurrentView('ai-sessions')
}

// 处理文件状态变化（提交后）
const handleFileStatusChanged = async (payload = {}) => {
  debugLog('🔄 [ProjectDetailNew] 文件状态变化', payload)
  
  // 检查是否有远程仓库
  let hasRemote = false
  try {
    const checkRemoteResult = await window.electronAPI.executeCommand({
      command: 'git remote',
      cwd: props.path
    })
    hasRemote = checkRemoteResult.success && checkRemoteResult.output?.trim()
  } catch (e) {
    debugLog('检查远程仓库失败:', e)
  }
  
  // commit-and-push 直接以工作区校验后的状态为准，不再做 +1
  if (payload?.type === 'commit-and-push') {
    const nextRemoteAhead = payload?.branchStatus?.remoteAhead || 0
    const nextLocalAhead = payload?.branchStatus?.localAhead || 0
    if (branchStatus.value) {
      branchStatus.value.remoteAhead = nextRemoteAhead
      branchStatus.value.localAhead = nextLocalAhead
    }
    if (allBranchStatus.value && currentBranch.value && allBranchStatus.value[currentBranch.value]) {
      allBranchStatus.value[currentBranch.value].remoteAhead = nextRemoteAhead
      allBranchStatus.value[currentBranch.value].localAhead = nextLocalAhead
    }
    emitStatusUpdated(props.path, {
      remoteAhead: nextRemoteAhead,
      localAhead: nextLocalAhead
    })
  } else if (payload?.type === 'commit' && hasRemote) {
    debugLog('🔄 [ProjectDetailNew] 有远程仓库，localAhead + 1')
    const newLocalAhead = (branchStatus.value?.localAhead || 0) + 1
    if (branchStatus.value) {
      branchStatus.value.localAhead = newLocalAhead
    }
    if (allBranchStatus.value && currentBranch.value && allBranchStatus.value[currentBranch.value]) {
      allBranchStatus.value[currentBranch.value].localAhead = newLocalAhead
    }
    emitStatusUpdated(props.path, {
      remoteAhead: branchStatus.value?.remoteAhead || 0,
      localAhead: newLocalAhead
    })
  } else {
    debugLog('🔄 [ProjectDetailNew] 仅刷新文件状态，不调整 ahead/behind')
  }
  
  bumpCommitHistoryRevision()
  emitPendingStatusChanged(props.path)
}

// 处理待定文件数量变化
const handlePendingCountChanged = (count) => {
  syncHasPendingFiles(count > 0)
}

const selectCommitHistory = () => {
  currentView.value = 'commit-history'
  saveCurrentView('commit-history')
}

const selectStashList = () => {
  currentView.value = 'stash-list'
  saveCurrentView('stash-list')
  if (stashListRef.value) {
    stashListRef.value.loadStashList?.()
  }
}

const selectPipeline = () => {
  currentView.value = 'pipeline'
  saveCurrentView('pipeline')
}

const selectTerminal = () => {
  terminalMounted.value = true
  currentView.value = 'terminal'
  saveCurrentView('terminal')
}

const selectWorkspace = () => {
  currentView.value = 'workspace'
  saveCurrentView('workspace')
}

const handleResumeAiSession = async (session) => {
  const command = typeof session?.command === 'string' ? session.command.trim() : ''
  if (!command) return

  terminalMounted.value = true
  currentView.value = 'terminal'
  saveCurrentView('terminal')

  await nextTick()

  if (props.isActive) {
    const targetCwd = session.cwd || terminalProjectPath.value
    if (terminalMode.value === 'liquid') {
      await liquidTerminalRef.value?.runCommand?.(command, {
        cwd: targetCwd,
        forceNewTerminal: true
      })
    } else {
      await terminalRef.value?.runCommand?.(command, {
        cwd: targetCwd,
        forceNewTerminal: true
      })
    }
  }
}

// 展开/折叠本地分支
const toggleLocalBranches = () => {
  // 图标条下：第一次点击只拉宽侧栏，不改变列表展开/折叠状态，也不触发加载
  if (isBranchesPanelIconRail.value) {
    expandSidePanelFromIconRail()
    return
  }
  showLocalBranches.value = !showLocalBranches.value
  saveExpandState()
}

const toggleTags = () => {
  if (isBranchesPanelIconRail.value) {
    expandSidePanelFromIconRail()
    return
  }
  showTags.value = !showTags.value
  saveExpandState()
  // 展开时，如果没有缓存且不在加载中，则加载标签
  if (showTags.value && tags.value.length === 0 && !tagsLoading.value) {
    loadTags()
  }
}

// 展开/折叠远程分支
const toggleRemoteBranches = () => {
  if (isBranchesPanelIconRail.value) {
    expandSidePanelFromIconRail()
    return
  }
  showRemoteBranches.value = !showRemoteBranches.value
  saveExpandState()
  // 展开时，如果没有缓存且不在加载中，则加载远程分支
  if (showRemoteBranches.value && remoteBranches.value.length === 0 && !refreshing.value) {
    loadRemoteBranches()
  }
}

// ==================== 分支操作 ====================
const switchBranch = async (branchName) => {
  if (!props.path || branchName === currentBranch.value) return
  
  openOperationDialog('切换分支', `正在切换到分支 "${branchName}"...\n`)
  
  try {
    const command = `cd "${props.path}" && git checkout "${branchName}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 分支切换失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 切换分支失败: ${error.message}`
  }
}

const switchToRemoteBranch = async (branchName) => {
  if (!props.path) return
  
  openOperationDialog('切换远程分支', `正在切换到远程分支 "${branchName}"...\n`)
  
  // 检查本地分支是否存在
  const checkResult = await executeCommand(`cd "${props.path}" && git show-ref --verify --quiet refs/heads/"${branchName}"`)
  
  if (checkResult.success) {
    finishOperation()
    operationOutput.value = `❌ 本地分支 "${branchName}" 已存在\n请双击本地分支列表中的 "${branchName}" 来切换`
    return
  }
  
  try {
    const command = `cd "${props.path}" && git checkout -b "${branchName}" origin/"${branchName}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 远程分支切换失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 切换远程分支失败: ${error.message}`
  }
}

// ==================== Pull/Push ====================
const pullProject = async () => {
  if (!props.path) return
  
  openOperationDialog('拉取代码', '正在拉取代码...\n')
  
  try {
    // 🔧 步骤1：检查是否设置了上游分支
    operationOutput.value += '检查上游分支设置...\n'
    const upstreamCheck = await executeCommand(`cd "${props.path}" && git rev-parse --abbrev-ref @{upstream} 2>/dev/null`)
    
    if (!upstreamCheck.success || !upstreamCheck.output?.trim()) {
      // 没有设置上游分支，尝试自动设置
      operationOutput.value += '⚠️ 未设置上游分支，尝试自动设置...\n'
      const branch = currentBranch.value
      const setUpstreamCmd = `cd "${props.path}" && git branch --set-upstream-to=origin/${branch} ${branch} 2>/dev/null || git push -u origin ${branch} 2>/dev/null`
      const setResult = await executeCommandWithProgress(setUpstreamCmd, appendProgressOutput)
      
      if (!setResult.success) {
        operationOutput.value += '\n⚠️ 无法自动设置上游分支，尝试直接拉取...\n'
      }
    }
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 🔧 步骤2：先执行 fetch 获取最新远程状态
    operationOutput.value += '\n获取远程更新...\n'
    await executeCommandWithProgress(`cd "${props.path}" && git fetch origin`, appendProgressOutput)
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 🔧 步骤3：执行拉取
    operationOutput.value += '\n拉取远程更改...\n'
    const command = `cd "${props.path}" && git pull --no-rebase`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    // 🔧 步骤4：检查是否有冲突
    const conflictCheck = await executeCommand(`cd "${props.path}" && git diff --name-only --diff-filter=U`)
    const hasConflicts = conflictCheck.success && conflictCheck.output?.trim()

    finishOperation()

    if (hasConflicts) {
      operationOutput.value += '\n\n⚠️ 拉取完成，但存在合并冲突！\n'
      operationOutput.value += '请在「工作区」中解决冲突后提交。\n'
      operationOutput.value += '冲突文件:\n' + conflictCheck.output
    } else if (result.success) {
      showOperationDialog.value = false
    } else {
      // 分析错误类型给出更友好的提示
      const errorMsg = result.error || result.output || ''
      if (errorMsg.includes('no tracking information') || errorMsg.includes('no upstream')) {
        operationOutput.value += '\n\n❌ 拉取失败: 当前分支没有关联远程分支\n'
        operationOutput.value += `尝试运行: git push -u origin ${currentBranch.value}`
      } else if (errorMsg.includes('local changes')) {
        operationOutput.value += '\n\n❌ 拉取失败: 存在未提交的本地更改\n'
        operationOutput.value += '请先提交或暂存本地更改后再拉取。'
      } else if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
        operationOutput.value += '\n\n⚠️ 拉取时发生冲突\n'
        operationOutput.value += '请在「工作区」中解决冲突。'
      } else {
        operationOutput.value += '\n\n❌ 拉取失败: ' + errorMsg
      }
    }
    queueProjectRefresh({ reloadBranchStatus: true, reloadFileStatus: true, preserveFileStatus: true, reloadCommitHistory: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 拉取失败: ${error.message}`
  }
}

const pushProject = async () => {
  if (!props.path) return
  
  openOperationDialog('推送代码', '正在推送代码...\n')
  
  try {
    // 🔧 检查是否设置了上游分支
    const upstreamCheck = await executeCommand(`cd "${props.path}" && git rev-parse --abbrev-ref @{upstream} 2>/dev/null`)
    
    let command = ''
    if (!upstreamCheck.success || !upstreamCheck.output?.trim()) {
      // 没有设置上游分支，使用 -u 参数
      operationOutput.value += '设置上游分支并推送...\n'
      command = `cd "${props.path}" && git push -u origin ${currentBranch.value}`
    } else {
      command = `cd "${props.path}" && git push`
    }
    
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranchStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      // 分析错误类型给出更友好的提示
      const errorMsg = result.error || result.output || ''
      if (errorMsg.includes('rejected') && (errorMsg.includes('non-fast-forward') || errorMsg.includes('fetch first'))) {
        operationOutput.value += '\n\n❌ 推送失败: 远程有新的提交\n'
        operationOutput.value += '请先拉取远程更新后再推送。'
      } else if (errorMsg.includes('no upstream') || errorMsg.includes('no tracking')) {
        operationOutput.value += '\n\n❌ 推送失败: 当前分支没有关联远程分支\n'
        operationOutput.value += `正在尝试设置上游分支...`
        // 尝试自动设置并推送
        const retryResult = await executeCommandWithProgress(`cd "${props.path}" && git push -u origin ${currentBranch.value}`, appendProgressOutput)
        if (retryResult.success) {
          // 推送成功后，直接将 localAhead 设为 0
          if (branchStatus.value) {
            branchStatus.value.localAhead = 0
          }
          if (allBranchStatus.value && currentBranch.value && allBranchStatus.value[currentBranch.value]) {
            allBranchStatus.value[currentBranch.value].localAhead = 0
          }
          // 通知 GitProject 更新项目列表
          emitStatusUpdated(props.path, {
            remoteAhead: branchStatus.value?.remoteAhead || 0,
            localAhead: 0
          })
          operationOutput.value += '\n\n✅ 推送完成'
          showOperationDialog.value = false
          queueProjectRefresh({ reloadBranchStatus: true, reloadCommitHistory: true })
          return
        }
        operationOutput.value += '\n\n❌ 推送失败'
      } else if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
        operationOutput.value += '\n\n❌ 推送失败: 权限不足\n'
        operationOutput.value += '请检查您的 Git 凭据设置。'
      } else {
        operationOutput.value += '\n\n❌ 推送失败: ' + errorMsg
      }
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 推送失败: ${error.message}`
  }
}

// ==================== 刷新远程分支 ====================
const refreshRemoteBranches = async () => {
  if (!props.path || refreshing.value) return
  
  refreshing.value = true
  refreshSuccess.value = false
  
  try {
    const result = await window.electronAPI.refreshRemote({ path: props.path })
    
    if (result.success) {
      if (result.data?.remote) {
        remoteBranches.value = result.data.remote
        updateProjectDetail(props.path, { remoteBranches: result.data.remote })
      }
      if (result.data?.currentBranchStatus) {
        branchStatus.value = result.data.currentBranchStatus
        storeBranchStatus(props.path, result.data.currentBranchStatus)
        emitStatusUpdated(props.path, branchStatus.value)
      }
      if (result.data?.allBranchStatus) {
        allBranchStatus.value = result.data.allBranchStatus
        storeAllBranchStatus(props.path, result.data.allBranchStatus)
      }
      bumpCommitHistoryRevision()
      markRefreshSuccess(refreshSuccess)
    }
  } catch (error) {
    console.error('刷新远程分支失败:', error)
  } finally {
    refreshing.value = false
  }
}

// ==================== 新建分支 ====================
const openCreateBranchDialog = () => {
  baseBranch.value = currentBranch.value
  newBranchName.value = ''
  showCreateBranchDialog.value = true
}

const closeCreateBranchDialog = () => {
  showCreateBranchDialog.value = false
  newBranchName.value = ''
  baseBranch.value = ''
}

const createBranch = async () => {
  if (!props.path || !newBranchName.value.trim()) return
  
  const branchName = newBranchName.value.trim()
  const fromBranch = baseBranch.value || currentBranch.value
  
  showCreateBranchDialog.value = false
  openOperationDialog('创建分支', `正在创建分支 "${branchName}" 基于 "${fromBranch}"...\n`)
  
  try {
    let command = ''
    if (fromBranch !== currentBranch.value) {
      command = `cd "${props.path}" && git checkout "${fromBranch}" && git checkout -b "${branchName}"`
    } else {
      command = `cd "${props.path}" && git checkout -b "${branchName}"`
    }
    
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 分支创建失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 创建分支失败: ${error.message}`
  }
}

// ==================== 分支右键菜单 ====================
const showBranchContextMenu = (event, branch, type) => {
  branchContextMenuBranch.value = type === 'remote' ? branch.replace('origin/', '') : branch
  branchContextMenuType.value = type
  branchContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showBranchContextMenuModal.value = true
  
  const closeMenu = () => {
    showBranchContextMenuModal.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

const checkoutBranchAction = () => {
  showBranchContextMenuModal.value = false
  if (branchContextMenuType.value === 'local') {
    switchBranch(branchContextMenuBranch.value)
  } else {
    switchToRemoteBranch(branchContextMenuBranch.value)
  }
}

const createBranchFromContext = () => {
  showBranchContextMenuModal.value = false
  baseBranch.value = branchContextMenuBranch.value
  newBranchName.value = ''
  showCreateBranchDialog.value = true
}

const createTagFromRemoteBranch = async () => {
  if (!branchContextMenuBranch.value) return
  showBranchContextMenuModal.value = false
  await openCreateTagDialog(`origin/${branchContextMenuBranch.value}`)
}

const mergeBranchAction = () => {
  if (branchContextMenuBranch.value === currentBranch.value) return
  showBranchContextMenuModal.value = false
  branchToMerge.value = branchContextMenuBranch.value
  showMergeBranchDialog.value = true
}

const copyBranchName = async () => {
  showBranchContextMenuModal.value = false
  if (branchContextMenuBranch.value) {
    try {
      await navigator.clipboard.writeText(branchContextMenuBranch.value)
      debugLog('✅ 分支名已复制:', branchContextMenuBranch.value)
    } catch (error) {
      console.error('复制分支名失败:', error)
    }
  }
}

const openDeleteBranchDialog = (contextType = 'local') => {
  const deletePlan = buildBranchDeleteDialogPlan({
    branch: branchContextMenuBranch.value,
    contextType,
    currentBranch: currentBranch.value
  })

  showBranchContextMenuModal.value = false
  if (!deletePlan) return

  branchToDelete.value = deletePlan.branch
  deleteLocalBranch.value = deletePlan.deleteLocal
  deleteRemoteBranch.value = deletePlan.deleteRemote
  deleteBranchMessage.value = deletePlan.message
  deleteBranchOperationText.value = deletePlan.operationText
  showDeleteRemoteOption.value = deletePlan.showRemoteToggle
  showDeleteBranchDialog.value = true
}

const deleteBranchAction = () => {
  openDeleteBranchDialog('local')
}

const deleteRemoteBranchAction = () => {
  openDeleteBranchDialog('remote')
}

const createMergeRequestFromBranch = () => {
  showBranchContextMenuModal.value = false
  sourceBranchForMR.value = branchContextMenuBranch.value
  targetBranchForMR.value = ''
  mrTitle.value = ''
  mrDescription.value = ''
  showCreateMRDialog.value = true
}

// ==================== 删除分支 ====================
const closeDeleteBranchDialog = () => {
  showDeleteBranchDialog.value = false
  branchToDelete.value = ''
  deleteLocalBranch.value = true
  deleteRemoteBranch.value = false
  deleteBranchMessage.value = ''
  deleteBranchOperationText.value = ''
  showDeleteRemoteOption.value = true
}

const confirmDeleteBranch = async () => {
  if (!props.path || !branchToDelete.value) return
  
  const branch = branchToDelete.value
  const deleteLocal = deleteLocalBranch.value
  const deleteRemote = deleteRemoteBranch.value
  const commands = buildBranchDeleteCommands({
    projectPath: props.path,
    branch,
    deleteLocal,
    deleteRemote
  })

  if (commands.length === 0) {
    closeDeleteBranchDialog()
    return
  }
  
  showDeleteBranchDialog.value = false
  openOperationDialog('删除分支', deleteBranchOperationText.value || `正在删除分支 "${branch}"...\n`)
  
  try {
    for (let index = 0; index < commands.length; index += 1) {
      if (index > 0) {
        operationOutput.value += '\n正在删除远程分支...\n'
      }
      await executeCommandWithProgress(commands[index], appendProgressOutput)
    }
    
    finishOperation({ hideDialog: true })
    queueProjectRefresh({ reloadBranches: true, reloadBranchStatus: true, reloadCommitHistory: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 删除分支失败: ${error.message}`
  }
}

// ==================== 合并分支 ====================
const closeMergeBranchDialog = () => {
  showMergeBranchDialog.value = false
  branchToMerge.value = ''
}

const confirmMergeBranch = async () => {
  if (!props.path || !branchToMerge.value) return
  
  const branch = branchToMerge.value
  
  showMergeBranchDialog.value = false
  openOperationDialog('合并分支', `正在将分支 "${branch}" 合并到 "${currentBranch.value}"...\n`)
  
  try {
    const command = `cd "${props.path}" && git merge "${branch}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 分支合并失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 合并分支失败: ${error.message}`
  }
}

// ==================== 标签操作 ====================
const checkoutTag = async (tag) => {
  if (!props.path || !tag) return
  
  openOperationDialog('检出标签', `正在检出标签 "${tag.name}"...\n注意: 这将进入detached HEAD状态\n`)
  
  try {
    const command = `cd "${props.path}" && git checkout "${tag.name}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      // detached HEAD 状态下没有远程跟踪分支，清除 push/pull 计数
      branchStatus.value = null
      emitStatusUpdated(props.path, { remoteAhead: 0, localAhead: 0 })
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 检出标签失败'
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 检出标签失败: ${error.message}`
  }
}

const handleTagContextMenu = (event, tag) => {
  event.preventDefault()
  tagContextMenuTag.value = tag
  tagContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showTagContextMenu.value = true
  
  const closeMenu = () => {
    showTagContextMenu.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

const copyTagName = async () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    try {
      await navigator.clipboard.writeText(tagContextMenuTag.value.name)
      debugLog('✅ 标签名已复制:', tagContextMenuTag.value.name)
    } catch (error) {
      console.error('复制标签名失败:', error)
    }
  }
}

const checkoutTagAction = () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    checkoutTag(tagContextMenuTag.value)
  }
}

const createBranchFromTag = () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    baseBranch.value = tagContextMenuTag.value.name
    newBranchName.value = ''
    showCreateBranchDialog.value = true
  }
}

const pushTagAction = async () => {
  if (!tagContextMenuTag.value || !props.path) return
  
  const tagName = tagContextMenuTag.value.name
  showTagContextMenu.value = false
  
  openOperationDialog('推送标签', `正在推送标签 "${tagName}" 到远程...\n`)
  
  try {
    const command = `cd "${props.path}" && git push origin "${tagName}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadTags: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 推送标签失败'
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 推送标签失败: ${error.message}`
  }
}

const deleteTagAction = () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    tagToDelete.value = tagContextMenuTag.value.name
    deleteRemoteTag.value = false
    showDeleteTagDialog.value = true
  }
}

// ==================== 创建标签 ====================
const openCreateTagDialog = async (commitRef = '') => {
  if (props.path && tags.value.length === 0 && !tagsLoading.value) {
    try {
      await loadTags()
    } catch (error) {
      console.error('预加载标签失败:', error)
    }
  }

  newTagName.value = getLargestStableSemverTagName()
  newTagMessage.value = ''
  tagCommit.value = commitRef
  pushTagAfterCreate.value = true
  showCreateTagDialog.value = true
}

const closeCreateTagDialog = () => {
  showCreateTagDialog.value = false
}

const confirmCreateTag = async () => {
  if (!props.path || !newTagName.value.trim()) return
  
  const tagName = newTagName.value.trim()
  
  showCreateTagDialog.value = false
  openOperationDialog('创建标签', `正在创建标签 "${tagName}"...\n`)
  
  try {
    let command = ''
    if (tagCommit.value.trim()) {
      if (newTagMessage.value.trim()) {
        command = `cd "${props.path}" && git tag -a "${tagName}" -m "${newTagMessage.value.trim()}" "${tagCommit.value.trim()}"`
      } else {
        command = `cd "${props.path}" && git tag "${tagName}" "${tagCommit.value.trim()}"`
      }
    } else {
      if (newTagMessage.value.trim()) {
        command = `cd "${props.path}" && git tag -a "${tagName}" -m "${newTagMessage.value.trim()}"`
      } else {
        command = `cd "${props.path}" && git tag "${tagName}"`
      }
    }
    
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      if (pushTagAfterCreate.value) {
        operationOutput.value += '\n正在推送到远程...\n'
        const pushCommand = `cd "${props.path}" && git push origin "${tagName}"`
        await executeCommandWithProgress(pushCommand, appendProgressOutput)
      }
      
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadTags: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 创建标签失败'
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 创建标签失败: ${error.message}`
  }
}

// ==================== 删除标签 ====================
const closeDeleteTagDialog = () => {
  showDeleteTagDialog.value = false
  tagToDelete.value = ''
  deleteRemoteTag.value = false
}

const confirmDeleteTag = async () => {
  if (!props.path || !tagToDelete.value) return
  
  const tagName = tagToDelete.value
  const deleteRemote = deleteRemoteTag.value
  
  showDeleteTagDialog.value = false
  openOperationDialog('删除标签', `正在删除标签 "${tagName}"${deleteRemote ? ' (包括远程标签)' : ''}...\n`)
  
  try {
    const command = `cd "${props.path}" && git tag -d "${tagName}"`
    await executeCommandWithProgress(command, appendProgressOutput)
    
    if (deleteRemote) {
      operationOutput.value += '\n正在删除远程标签...\n'
      const remoteCommand = `cd "${props.path}" && git push origin :refs/tags/${tagName}`
      await executeCommandWithProgress(remoteCommand, appendProgressOutput)
    }
    
    finishOperation({ hideDialog: true })
    queueProjectRefresh({ reloadTags: true, reloadCommitHistory: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 删除标签失败: ${error.message}`
  }
}

// ==================== 创建 MR ====================
const openMRDialog = () => {
  sourceBranchForMR.value = currentBranch.value
  targetBranchForMR.value = ''
  mrTitle.value = ''
  mrDescription.value = ''
  showCreateMRDialog.value = true
}

const closeMRDialog = () => {
  showCreateMRDialog.value = false
}

const confirmCreateMR = async () => {
  if (!props.path || !sourceBranchForMR.value || !targetBranchForMR.value || !mrTitle.value.trim()) return
  
  showCreateMRDialog.value = false
  openOperationDialog('创建 Merge Request', `正在创建 MR: ${sourceBranchForMR.value} -> ${targetBranchForMR.value}\n标题: ${mrTitle.value}\n`)
  
  try {
    // 获取 GitLab URL
    const urlResult = await executeCommand(`cd "${props.path}" && git remote get-url origin`)
    if (!urlResult.success || !urlResult.output?.trim()) {
      throw new Error('无法获取 Git remote URL')
    }
    
    let gitlabUrl = urlResult.output.trim()
    if (gitlabUrl.startsWith('git@')) {
      const match = gitlabUrl.match(/git@(.+?):(.+?)\.git$/)
      if (match) {
        gitlabUrl = `https://${match[1]}/${match[2]}`
      }
    } else {
      gitlabUrl = gitlabUrl.replace(/\.git$/, '')
    }
    
    // 构建 MR URL
    const mrUrl = `${gitlabUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(sourceBranchForMR.value)}&merge_request[target_branch]=${encodeURIComponent(targetBranchForMR.value)}&merge_request[title]=${encodeURIComponent(mrTitle.value)}&merge_request[description]=${encodeURIComponent(mrDescription.value)}`
    
    operationOutput.value += `\n正在打开 GitLab MR 页面...\n`
    emit('navigate', mrUrl)
    
    finishOperation({ hideDialog: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 创建 MR 失败: ${error.message}`
  }
}

// ==================== 外部应用 ====================
const openWithGitLab = async () => {
  if (!props.path) return
  try {
    const result = await executeCommand(`cd "${props.path}" && git remote get-url origin`)
    if (!result.success || !result.output?.trim()) {
      throw new Error('无法获取 Git remote URL')
    }
    
    let gitlabUrl = result.output.trim()
    if (gitlabUrl.startsWith('git@')) {
      const match = gitlabUrl.match(/git@(.+?):(.+?)\.git$/)
      if (match) {
        gitlabUrl = `https://${match[1]}/${match[2]}`
      }
    } else {
      gitlabUrl = gitlabUrl.replace(/\.git$/, '')
    }
    
    debugLog('🔗 [ProjectDetailNew] 打开 GitLab:', gitlabUrl)
    if (window.electronAPI?.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(gitlabUrl)
    }
  } catch (error) {
    console.error('打开 GitLab 失败:', error)
  }
}

const openInFinder = async () => {
  if (!props.path) return
  try {
    await window.electronAPI.openInFinder({ path: props.path })
  } catch (error) {
    console.error('打开访达失败:', error)
  }
}

// ==================== 项目设置 ====================
const openProjectSettings = () => {
  showProjectSettings.value = true
}

const toggleFavorite = () => {
  const path = String(props.path || '').trim()
  if (!path) return
  emit('toggleFavorite', {
    path,
    title: String(projectInfo.value?.name || '').trim() || path.split(/[\\/]/).filter(Boolean).pop() || '项目'
  })
}

const unmountTerminalForModeChange = async () => {
  terminalMounted.value = false
  terminalRef.value = null
  liquidTerminalRef.value = null
  await nextTick()
}

const onProjectSettingsConfirm = async (payload = {}) => {
  debugLog('✅ 项目设置已保存')
  const nextTerminalMode = payload?.terminalMode === 'liquid' ? 'liquid' : 'split'
  const terminalModeChanged = terminalMode.value !== nextTerminalMode
  if (terminalModeChanged && terminalMounted.value) {
    await unmountTerminalForModeChange()
  }
  terminalMode.value = nextTerminalMode
  if (terminalModeChanged && currentView.value === 'terminal') {
    terminalMounted.value = true
    await nextTick()
  }
  if (props.path) {
    void setConfigString(getProjectTerminalModeKey(props.path), nextTerminalMode).catch(() => {})
  }
  // 刷新远程分支列表
  refreshRemoteBranches()
}

// ==================== 取消操作 ====================
const cancelOperation = () => {
  baseCancelOperation()
  showOperationDialog.value = false
  
  // 刷新状态（保留勾选状态）
  if (fileStatusRef.value) {
    fileStatusRef.value.loadFileStatus?.(true)
  }
  loadBranchStatus()
}

// ==================== 生命周期 ====================
watch(() => props.path, async (newPath, oldPath) => {
  clearAiSessionsPreload()
  clearWorkspacePreload()
  clearPipelineSummaryTimer()
  stopProjectGitMonitor()
  resetProjectGitMonitorState()
  if (newPath) {
    terminalMode.value = await getSavedTerminalMode(newPath)
    isGitRepository.value = null
    activePipelineSummary.value = null
    // 恢复该项目保存的视图状态和展开状态（electron-store）
    currentView.value = await getSavedCurrentView(newPath)
    if (currentView.value === 'terminal') {
      terminalMounted.value = true
    }
    if (currentView.value === 'ai-sessions') {
      aiSessionsMounted.value = true
    }
    if (currentView.value === 'workspace') {
      workspaceMounted.value = true
    }
    await restoreExpandState(newPath)
    await loadBranchesPanelWidth(newPath)

    // 切换项目时先清空所有数据，防止显示旧项目的数据
    branchStatus.value = null
    allBranchStatus.value = {}
    allBranches.value = []
    remoteBranches.value = []
    tags.value = []
    currentBranch.value = ''
    hasPendingFiles.value = false
    tagsLoading.value = false
    tagsRefreshing.value = false
    tagsRefreshSuccess.value = false
    refreshing.value = false
    refreshSuccess.value = false
    statusLoading.value = false

    // 再从 store 读取缓存数据立即显示
    const cachedDetail = getProjectDetail(newPath)
    if (cachedDetail) {
      // 立即应用缓存的分支数据
      if (cachedDetail.localBranches?.length > 0) {
        allBranches.value = cachedDetail.localBranches
      }
      if (cachedDetail.remoteBranches?.length > 0) {
        remoteBranches.value = cachedDetail.remoteBranches
      }
      if (cachedDetail.currentBranch) {
        currentBranch.value = cachedDetail.currentBranch
      }
      if (cachedDetail.branchStatus) {
        branchStatus.value = cachedDetail.branchStatus
      }
      if (cachedDetail.allBranchStatus && Object.keys(cachedDetail.allBranchStatus).length > 0) {
        allBranchStatus.value = cachedDetail.allBranchStatus
      }
      if (cachedDetail.tags?.length > 0) {
        tags.value = cachedDetail.tags
      }
      debugLog('📦 [ProjectDetailNew] 从 store 读取缓存数据:', newPath)
    }
    
    // 选中项目时清理分支状态缓存，确保分支名和 ahead/behind 都按当前仓库状态重算
    detectGitRepository(newPath).then((isGit) => {
      if (props.path !== newPath) return
      if (!isGit) {
        debugLog('ℹ️ [ProjectDetailNew] 当前路径不是 Git 仓库，跳过自动刷新')
        return
      }

      clearProjectBranchStatusCache(newPath).finally(() => {
        if (props.path === newPath && isGitRepository.value !== false) {
          loadProjectInfo()
          refreshPipelineSummary({ silent: true })
        }
      })
    })

    scheduleAiSessionsPreload()
    scheduleWorkspacePreload()
    if (shouldPollProjectGitMonitor.value && isGitRepository.value !== false) {
      startProjectGitMonitor()
    }
  } else {
    branchesPanelWidthPx.value = BRANCHES_PANEL_DEFAULT
    branchesPanelLastExpandedWidth.value = BRANCHES_PANEL_DEFAULT
    projectInfo.value = null
    isGitRepository.value = false
    activePipelineSummary.value = null
    // 切换项目时重置状态
    branchStatus.value = null
    allBranchStatus.value = {}
    allBranches.value = []
    remoteBranches.value = []
    tags.value = []
    tagsLoading.value = false
    tagsRefreshing.value = false
    tagsRefreshSuccess.value = false
    refreshing.value = false
    refreshSuccess.value = false
    statusLoading.value = false
    aiSessionsMounted.value = false
  }
}, { immediate: true })

watch(currentView, (view) => {
  if (view === 'terminal' && props.isActive) {
    terminalMounted.value = true
  }
  if (view === 'ai-sessions') {
    aiSessionsMounted.value = true
  }
  if (view === 'workspace') {
    workspaceMounted.value = true
  }
}, { immediate: true })

watch(() => props.isActive, (active) => {
  if (active && currentView.value === 'terminal') {
    terminalMounted.value = true
  }
  if (active && props.path && isGitRepository.value !== false) {
    refreshPipelineSummary({ silent: true })
  } else if (!active) {
    clearPipelineSummaryTimer()
  }
})

watch(shouldPollProjectGitMonitor, (shouldRun) => {
  if (shouldRun) {
    startProjectGitMonitor()
  } else {
    stopProjectGitMonitor()
  }
})

// 刷新当前项目状态（供外部调用，如标签切换时）
const refreshCurrentProject = async () => {
  if (!props.path || isGitRepository.value === false) return

  debugLog('🔄 [ProjectDetailNew] 刷新当前项目状态...')

  await clearProjectBranchStatusCache(props.path)
  bumpCommitHistoryRevision()

  // 异步刷新文件状态（保留勾选状态）
  if (fileStatusRef.value?.loadFileStatus) {
    fileStatusRef.value.loadFileStatus(true)
  }

  // 重新读取当前分支、分支列表和 ahead/behind，并在展开标签区时一并刷新标签
  loadProjectInfo({
    forceRefreshRemoteBranches: showRemoteBranches.value,
    forceRefreshTags: showTags.value,
    refreshBranchStatus: true
  })
}

// 窗口获得焦点时刷新状态（只有当前标签激活时才刷新）
const handleWindowFocus = async () => {
  if (!props.path || !props.isActive || isGitRepository.value === false) return
  
  debugLog('🔄 [ProjectDetailNew] 窗口获得焦点，刷新状态...')
  refreshPipelineSummary({ silent: true })
  refreshCurrentProject()
}

// 窗口焦点变化处理
const handleVisibilityChange = () => {
  isDocumentVisible.value = document.visibilityState === 'visible'
  if (document.visibilityState === 'hidden' && props.path) {
    if (branchesPanelWidthSaveThrottleTimer) {
      clearTimeout(branchesPanelWidthSaveThrottleTimer)
      branchesPanelWidthSaveThrottleTimer = null
    }
    saveBranchesPanelWidth()
  }
  if (isDocumentVisible.value && props.isActive) {
    handleWindowFocus()
  } else {
    clearPipelineSummaryTimer()
  }
}

const flushBranchesPanelWidthBeforeLeave = () => {
  if (props.path) {
    if (branchesPanelWidthSaveThrottleTimer) {
      clearTimeout(branchesPanelWidthSaveThrottleTimer)
      branchesPanelWidthSaveThrottleTimer = null
    }
    void persistBranchesPanelWidth().catch(() => {})
  }
}

onMounted(async () => {
  if (props.path) {
    await loadBranchesPanelWidth(props.path)
  }
  // 监听窗口焦点事件
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('beforeunload', flushBranchesPanelWidthBeforeLeave)
  // 监听 Electron 的窗口焦点事件
  if (window.electronAPI?.onWindowFocus) {
    window.electronAPI.onWindowFocus(handleWindowFocus)
  }
})

onBeforeUnmount(() => {
  flushBranchesPanelWidthBeforeLeave()
})

onUnmounted(() => {
  clearAiSessionsPreload()
  clearWorkspacePreload()
  clearPipelineSummaryTimer()
  stopProjectGitMonitor()
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('beforeunload', flushBranchesPanelWidthBeforeLeave)
  if (window.electronAPI?.removeWindowFocusListener) {
    window.electronAPI.removeWindowFocusListener(handleWindowFocus)
  }
})

// 监听标签激活状态变化，切换到当前标签时刷新
watch(() => props.isActive, (newIsActive, oldIsActive) => {
  if (oldIsActive && !newIsActive && props.path) {
    flushBranchesPanelWidthBeforeLeave()
  }
  if (newIsActive && !oldIsActive && props.path && isGitRepository.value !== false) {
    debugLog('🔄 [ProjectDetailNew] 标签激活，刷新状态...')
    refreshCurrentProject()
  }
})

watch(showCreateTagDialog, async (visible) => {
  if (!visible) return
  await nextTick()
  newTagNameInputRef.value?.focus?.()
  newTagNameInputRef.value?.select?.()
})

// ==================== 暴露给父组件 ====================
defineExpose({
  fileStatusRef,
  loadBranches,
  loadBranchStatus,
  refreshRemoteBranches,
  refreshCurrentProject
})
</script>

<style scoped>
.main-content {
  flex: 1 1 0%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding-left: 0;
  box-sizing: border-box;
  background: var(--app-project-bg);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--app-text-muted);
}

.empty-state-icon { opacity: 0.3; margin-bottom: 16px; }
.empty-state h3 { margin: 0 0 8px 0; font-size: 18px; color: var(--app-text-secondary); }
.empty-state p { margin: 0; font-size: 14px; }

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--app-text-muted);
  font-size: 13px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--app-project-bg) 92%, black 8%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.project-detail {
  /* ProjectDetail 作用域内统一把工作区底色映射为项目底色，确保子页面同步 */
  --app-workspace-bg: var(--app-project-bg);
  flex: 1 1 0%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-project-bg);
}

.header {
  height: 34px;
  padding: 0 16px;
  background: var(--app-project-bg);
  border: none;
  box-shadow: none;
  border-radius: 0;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
}

.project-info {
  display: flex;
  align-items: center;
  min-height: 100%;
  padding-top: 2px;
  box-sizing: border-box;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-branch-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 400;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.current-branch-inline.detached-head {
  color: #ff9800;
  font-weight: 500;
  font-style: italic;
}

.status-loading {
  color: var(--app-text-secondary);
  font-size: 16px;
  margin-left: 8px;
  animation: spin 1s linear infinite;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 0;
}

.create-btn, .pull-single-btn, .push-single-btn, .mr-single-btn,
.gitlab-open-btn, .finder-open-btn, .favorite-project-btn, .settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 11px;
  border: none;
  border-radius: 11px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  height: 32px;
  box-sizing: border-box;
}

.create-btn,
.pull-single-btn,
.push-single-btn,
.mr-single-btn,
.gitlab-open-btn,
.finder-open-btn {
  color: var(--app-text-primary);
}

.create-btn {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.create-btn:hover {
  background: color-mix(in srgb, var(--app-hover) 70%, white 30%);
}

.pull-single-btn {
  background: var(--app-warning-bg);
  color: var(--app-warning);
}

.pull-single-btn:hover {
  background: color-mix(in srgb, var(--app-warning-bg) 80%, white 20%);
}

.push-single-btn {
  background: var(--app-info-bg);
  color: var(--app-info);
}

.push-single-btn:hover {
  background: color-mix(in srgb, var(--app-info-bg) 80%, white 20%);
}

.mr-single-btn {
  background: rgba(139, 92, 246, 0.18);
  color: #c4b5fd;
}

.mr-single-btn:hover {
  background: rgba(139, 92, 246, 0.26);
}

.gitlab-open-btn {
  background: rgba(249, 115, 22, 0.18);
  color: #fdba74;
}

.gitlab-open-btn:hover {
  background: rgba(249, 115, 22, 0.26);
}

.finder-open-btn {
  background: rgba(20, 184, 166, 0.18);
  color: #99f6e4;
}

.finder-open-btn:hover {
  background: rgba(20, 184, 166, 0.26);
}

.favorite-project-btn {
  background: rgba(250, 204, 21, 0.08);
  color: var(--app-warning);
  padding: 8px;
}

.favorite-project-btn:hover {
  background: rgba(250, 204, 21, 0.16);
  color: #fef3c7;
}

.favorite-project-btn.active {
  background: rgba(250, 204, 21, 0.22);
  color: #facc15;
}

.settings-btn {
  background: var(--app-hover);
  color: var(--app-text-primary);
  padding: 8px;
}
.settings-btn:hover { 
  background: color-mix(in srgb, var(--app-hover) 65%, white 35%);
  color: var(--app-text-primary);
}

.pull-count-badge, .push-count-badge {
  background: rgba(100, 100, 100, 0.8);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  min-width: 16px;
  text-align: center;
}

.project-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--app-project-bg);
}

.project-main-area--branch-rail {
  overflow-x: visible;
}

.content-wrapper {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  gap: 0;
  padding: 0;
  background: var(--app-project-bg);
}

/* 左栏图标条：允许悬停提示伸到右侧主区域上方，避免被 overflow 裁掉 */
.content-wrapper--branch-rail {
  overflow: visible;
}

.content-wrapper--branch-rail .branches-panel {
  z-index: 4;
}

.content-wrapper--branch-rail .branches-panel-resizer {
  z-index: 5;
}

.branches-panel {
  flex-shrink: 0;
  min-height: 0;
  box-sizing: border-box;
  background: var(--app-project-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 0;
  padding: 0 0 6px;
}

/* 仅下方列表滚动；顶栏（侧栏宽切换）固定不跟滚动 */
.branches-panel-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--app-project-bg);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.branches-panel-scroll::-webkit-scrollbar {
  width: 3px;
  height: 3px;
}

.branches-panel-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.branches-panel-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1.5px;
}

.branches-panel-scroll::-webkit-scrollbar-corner {
  background: transparent;
}

/* 图标条下列表区域：不要用 overflow 裁切，否则右侧 ::after 悬停提示会被挡住（导航在 scroll 外故正常） */
.branches-panel--icon-rail .branches-panel-scroll {
  overflow: visible;
}

.branches-panel-list-head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  padding: 0;
  background: var(--app-project-bg);
}

/* 标题条背景撑满侧栏宽；左右用 padding 与下方列表项「外边距+内边距」对齐（8+12=20） */
.branches-panel-list-head-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 10px 20px;
  height: 40px;
  min-height: 40px;
  box-sizing: border-box;
  border: none;
  border-radius: 14px 14px 0 0;
  background: var(--app-project-bg);
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.branches-panel-list-head-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.branches-panel-list-head-ico {
  flex-shrink: 0;
  opacity: 0.88;
}

.branches-panel-list-head-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 图标条：与下方导航项同一套视觉；左右 margin 缩进，hover/选中底不撑满侧栏 */
.branches-panel-list-head-btn--rail {
  align-self: stretch;
  width: auto;
  justify-content: center;
  margin: 0 4px 4px;
  padding: 10px 6px;
  gap: 0;
  height: auto;
  min-height: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--app-text-secondary);
  font-weight: 400;
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* 必须盖过上面的 .branches-panel-list-head-btn:hover（0.045），与 .file-status-button:hover 一致 */
.branches-panel.branches-panel--icon-rail .branches-panel-list-head-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-secondary);
}

.branches-panel.branches-panel--icon-rail {
  overflow: visible;
  padding-bottom: 6px;
}

.branches-panel-resizer {
  flex-shrink: 0;
  width: 3px;
  margin: 0 -1px;
  cursor: col-resize;
  align-self: stretch;
  background: transparent;
  touch-action: none;
}

/* 刻意不做分割线高亮，避免一条显眼竖线；仅靠光标表示可拖拽 */
.branches-panel-resizer:hover,
.branches-panel-resizer:active {
  background: transparent;
}

.branches-panel--icon-rail .file-status-button {
  justify-content: center;
  gap: 4px;
  padding: 10px 6px;
  margin: 0 4px 4px;
  border-radius: 11px;
}

.branches-panel--icon-rail .branches-nav-label,
.branches-panel--icon-rail .branch-section-label,
.branches-panel--icon-rail .expand-arrow {
  display: none;
}

.branches-panel--icon-rail .pipeline-inline-status {
  display: none;
}

.branches-panel--icon-rail .pending-icon {
  display: none !important;
}

.branches-panel--icon-rail .branch-section-header {
  justify-content: center;
  gap: 4px;
  padding: 10px 6px;
  margin: 0 4px 4px;
  border-radius: 11px;
}

.branches-panel--icon-rail .branch-section-header .refresh-btn {
  display: none !important;
}

/* 图标条：伪元素在项右侧显示文案（避免依赖易被裁切的原生 title） */
.branches-panel--icon-rail .rail-tip-target {
  position: relative;
  z-index: 0;
}

.branches-panel--icon-rail .rail-tip-target:hover {
  z-index: 30;
}

.branches-panel--icon-rail .rail-tip-target::after {
  content: attr(data-rail-tip);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
  color: var(--app-text-primary);
  background: var(--app-tooltip-bg);
  border: 1px solid var(--app-border-strong);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.1s ease, visibility 0.1s ease;
  z-index: 50;
}

.branches-panel--icon-rail .rail-tip-target:hover::after {
  opacity: 1;
  visibility: visible;
}

.branches-panel--icon-rail .branch-list .branch-item,
.branches-panel--icon-rail .branch-list .tag-item {
  margin: 1px 4px;
  padding-left: 12px;
  padding-right: 12px;
}

.branches-panel--icon-rail .branch-name {
  font-size: 11px;
}

.file-status-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--app-text-secondary);
  font-size: 13px;
  user-select: none;
  margin: 0 0 2px;
  border-radius: 11px;
}

.file-status-button:hover { background: var(--app-hover); }
.file-status-button.active {
  background: var(--app-sidebar-selected-bg);
  border-radius: var(--app-selected-radius);
  color: var(--app-text-primary);
  font-weight: 500;
}

.branch-section {
  padding: 0 0 6px;
}

.branch-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--app-text-secondary);
  font-size: 13px;
  user-select: none;
  margin: 0 0 2px;
  border-radius: 11px;
}

.branch-section-header:hover { background: var(--app-hover); }

.expand-arrow {
  margin-left: auto;
  color: var(--app-text-muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-arrow.expanded {
  transform: rotate(90deg);
}

.branch-count {
  margin-left: auto;
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
}

.refresh-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--app-text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-btn:hover { background: var(--app-hover); color: var(--app-text-primary); }
.refresh-btn.refreshing { animation: spin 1s linear infinite; }
.refresh-btn.success { color: var(--app-success); }

.branch-list {
  padding: 0 0 4px;
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 16px 5px 24px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--app-text-secondary);
  font-size: 11px;
  user-select: none;
  margin: 1px 0;
  border-radius: 9px;
}

.branches-panel > :first-child,
.branch-list > :first-child {
  margin-top: 0 !important;
}

.branch-item:hover { background: var(--app-hover); }
.branch-item.active {
  background: var(--app-sidebar-selected-bg);
  border-radius: var(--app-selected-radius);
  color: var(--app-text-primary);
}

.branch-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }

.branch-status-indicator {
  display: flex;
  gap: 4px;
  font-size: 10px;
  flex-shrink: 0;
}

.pull-indicator { color: var(--app-warning); font-size: 11px; }
.push-indicator { color: var(--app-success); font-size: 11px; }

.pending-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 6px;
}

.pending-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
  margin-left: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.header-branch-status {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}

.pipeline-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 2px 8px;
  border: 0;
  border-radius: 999px;
  background: var(--app-warning-bg);
  color: var(--app-warning);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.pipeline-status-pill:hover {
  background: color-mix(in srgb, var(--app-warning-bg) 80%, white 20%);
}

.pipeline-inline-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--app-warning);
}

.pipeline-status-running,
.pipeline-status-pending,
.pipeline-status-preparing,
.pipeline-status-waiting_for_resource,
.pipeline-status-created {
  color: var(--app-warning);
}

.pipeline-status-failed,
.pipeline-status-canceled {
  color: var(--app-danger);
}

.pipeline-status-success {
  color: var(--app-success);
}

.remote-branch { 
  color: rgba(255, 255, 255, 0.6); 
}

.tag-item {
  display: flex;
  align-items: center;
  padding: 5px 16px 5px 24px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--app-text-secondary);
  user-select: none;
  margin: 1px 0;
  border-radius: 9px;
}

.tag-item:hover { background: var(--app-hover); }

.empty-tags {
  padding: 8px 16px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.right-panel {
  flex: 1 1 0%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
  background: var(--app-project-bg);
  border-radius: 0;
}

/* 右侧各视图占满剩余高度，避免子组件 height:100% 无参照 */
.right-panel > * {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  background: var(--app-project-bg);
}

/* 弹框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--app-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: var(--app-dialog-bg);
  border-radius: 12px;
  padding: 0;
  min-width: 450px;
  max-width: 600px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.dialog-header-simple {
  padding: 16px 20px;
  border-bottom: 1px solid var(--app-border);
}

.dialog-header-simple h3 {
  margin: 0;
  color: var(--app-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.dialog-body {
  padding: 16px 20px;
  min-height: 120px;
}

.dialog-body p {
  margin: 0 0 16px;
  color: var(--app-text-secondary);
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--app-text-primary);
  font-size: 14px;
}

.branch-select, .branch-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--app-hover);
  color: var(--app-text-primary);
  box-sizing: border-box;
}

.branch-select {
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.branch-select option {
  background: var(--app-dialog-bg);
  color: var(--app-text-primary);
  padding: 8px 12px;
}

.branch-select:focus, .branch-input:focus {
  outline: none;
  border-color: var(--app-border-strong);
}

.mr-description {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
  background: var(--app-hover);
  color: var(--app-text-primary);
  box-sizing: border-box;
  font-family: inherit;
}

.mr-description:focus {
  outline: none;
  border-color: var(--app-border-strong);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--app-border);
}

.cancel-btn-large {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn-large:hover {
  background: color-mix(in srgb, var(--app-hover) 70%, white 30%);
}

.confirm-btn-large {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: var(--app-primary);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn-large:hover:not(:disabled) { background: color-mix(in srgb, var(--app-primary) 82%, black 18%); }
.confirm-btn-large:disabled { opacity: 0.5; cursor: not-allowed; }

.delete-btn-large {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: var(--app-danger-bg);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-btn-large:hover { background: color-mix(in srgb, var(--app-danger-bg) 85%, black 15%); }

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--app-menu-bg);
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 160px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
  z-index: 1000;
}

.context-menu-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: 13px;
  color: var(--app-text-primary);
}

.context-menu-item:hover { background: var(--app-hover); }
.context-menu-item.disabled { opacity: 0.5; cursor: not-allowed; }

.context-menu-divider {
  height: 1px;
  background: var(--app-border);
  margin: 6px 0;
}

</style>
