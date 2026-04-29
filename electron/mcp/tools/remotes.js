function createRemotesTools(service, options = {}) {
  const tools = [
    {
      name: 'remotes.detect_provider',
      description: 'Detect the remote provider for a project path (gitlab/github/gitee/unknown).',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' }
        }
      },
      handler: async (args = {}) => service.detectProvider(args.projectPath)
    },
    {
      name: 'remotes.get_repo',
      description: 'Get normalized remote repository metadata for a project path.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' }
        }
      },
      handler: async (args = {}) => service.getRepo(args.projectPath)
    },
    {
      name: 'remotes.list_branches',
      description: 'List remote branches for a project path using saved remote provider credentials when needed.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' }
        }
      },
      handler: async (args = {}) => service.listBranches(args.projectPath)
    },
    {
      name: 'remotes.list_merge_requests',
      description: 'List merge requests for GitLab or pull requests for Gitee repositories.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' },
          state: { type: 'string', description: 'Provider-specific MR state such as opened or merged' }
        }
      },
      handler: async (args = {}) => service.listMergeRequests(args.projectPath, args.state)
    },
    {
      name: 'remotes.list_pull_requests',
      description: 'List GitHub pull requests for a project path.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' },
          state: { type: 'string', description: 'Pull request state, usually open/closed/all' }
        }
      },
      handler: async (args = {}) => service.listPullRequests(args.projectPath, args.state)
    },
    {
      name: 'remotes.list_pipelines',
      description: 'List recent pipelines or workflow runs for a project path.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' },
          limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Maximum pipelines to return' }
        }
      },
      handler: async (args = {}) => service.listPipelines(args.projectPath, args.limit)
    },
    {
      name: 'remotes.get_pipeline',
      description: 'Get details and jobs for a specific pipeline or workflow run.',
      inputSchema: {
        type: 'object',
        required: ['projectPath', 'pipelineId'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' },
          pipelineId: {
            oneOf: [
              { type: 'integer' },
              { type: 'string', minLength: 1 }
            ],
            description: 'Pipeline id or workflow run id'
          }
        }
      },
      handler: async (args = {}) => service.getPipeline(args.projectPath, args.pipelineId)
    }
  ]

  if (options.enableWrite) {
    tools.push(
      {
        name: 'remotes.create_merge_request',
        description: 'Create a GitLab merge request for a project path.',
        inputSchema: {
          type: 'object',
          required: ['projectPath', 'sourceBranch', 'targetBranch', 'title'],
          properties: {
            projectPath: { type: 'string', minLength: 1 },
            sourceBranch: { type: 'string', minLength: 1 },
            targetBranch: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            removeSourceBranch: { type: 'boolean' },
            draft: { type: 'boolean' }
          }
        },
        handler: async (args = {}) => service.createMergeRequest(args)
      },
      {
        name: 'remotes.create_pull_request',
        description: 'Create a pull request for a GitHub or Gitee repository.',
        inputSchema: {
          type: 'object',
          required: ['projectPath', 'sourceBranch', 'targetBranch', 'title'],
          properties: {
            projectPath: { type: 'string', minLength: 1 },
            sourceBranch: { type: 'string', minLength: 1 },
            targetBranch: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            draft: { type: 'boolean' }
          }
        },
        handler: async (args = {}) => service.createPullRequest(args)
      },
      {
        name: 'remotes.comment_merge_request',
        description: 'Add a comment to a GitLab merge request.',
        inputSchema: {
          type: 'object',
          required: ['projectPath', 'mergeRequestIid', 'body'],
          properties: {
            projectPath: { type: 'string', minLength: 1 },
            mergeRequestIid: { oneOf: [{ type: 'integer' }, { type: 'string', minLength: 1 }] },
            body: { type: 'string', minLength: 1 }
          }
        },
        handler: async (args = {}) => service.commentMergeRequest(args)
      },
      {
        name: 'remotes.comment_pull_request',
        description: 'Add a comment to a GitHub or Gitee pull request.',
        inputSchema: {
          type: 'object',
          required: ['projectPath', 'pullRequestNumber', 'body'],
          properties: {
            projectPath: { type: 'string', minLength: 1 },
            pullRequestNumber: { oneOf: [{ type: 'integer' }, { type: 'string', minLength: 1 }] },
            body: { type: 'string', minLength: 1 }
          }
        },
        handler: async (args = {}) => service.commentPullRequest(args)
      },
      {
        name: 'remotes.rerun_pipeline',
        description: 'Retry or rerun a remote pipeline / workflow run.',
        inputSchema: {
          type: 'object',
          required: ['projectPath', 'pipelineId'],
          properties: {
            projectPath: { type: 'string', minLength: 1 },
            pipelineId: { oneOf: [{ type: 'integer' }, { type: 'string', minLength: 1 }] },
            failedJobsOnly: { type: 'boolean' }
          }
        },
        handler: async (args = {}) => service.rerunPipeline(args)
      }
    )
  }

  if (options.enableRequest) {
    tools.push({
      name: 'remotes.request',
      description: 'Send a controlled provider API request using OpenGit-managed credentials without exposing tokens.',
      inputSchema: {
        type: 'object',
        required: ['projectPath', 'method', 'path'],
        properties: {
          projectPath: { type: 'string', minLength: 1 },
          provider: { type: 'string' },
          method: { type: 'string', minLength: 1 },
          path: { type: 'string', minLength: 1 },
          query: { type: 'object' },
          body: {},
          headers: { type: 'object' }
        }
      },
      handler: async (args = {}) => service.requestRemoteApi(args)
    })
  }

  return tools
}

module.exports = {
  createRemotesTools
}
