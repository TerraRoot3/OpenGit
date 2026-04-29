const { commonInputSchemas } = require('../schema')

function createProjectsTools(service) {
  return [
    {
      name: 'projects.list',
      description: 'List all saved directories and git repositories known to OpenGit.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async () => service.listProjects()
    },
    {
      name: 'projects.find',
      description: 'Find projects by name or path fragment.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: commonInputSchemas.query
        }
      },
      handler: async (args = {}) => service.findProjects(args.query)
    },
    {
      name: 'projects.get',
      description: 'Get details for a specific project or directory path.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: commonInputSchemas.projectPath
        }
      },
      handler: async (args = {}) => service.getProject(args.projectPath)
    },
    {
      name: 'projects.get_active',
      description: 'Get the currently active project tab in OpenGit.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async () => service.getActiveProject()
    },
    {
      name: 'projects.get_open_tabs',
      description: 'List all currently open project-related tabs in OpenGit.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async () => service.getOpenProjectTabs()
    }
  ]
}

module.exports = {
  createProjectsTools
}
