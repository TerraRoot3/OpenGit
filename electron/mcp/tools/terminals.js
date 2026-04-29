function createTerminalsTools(service, options = {}) {
  const tools = [
    {
      name: 'terminals.list',
      description: 'List all currently tracked OpenGit terminal sessions.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async () => service.listTerminals()
    },
    {
      name: 'terminals.get_output',
      description: 'Get recent output from a terminal session.',
      inputSchema: {
        type: 'object',
        required: ['terminalId'],
        properties: {
          terminalId: { type: 'string', minLength: 1, description: 'Terminal session id' },
          lines: { type: 'integer', minimum: 1, maximum: 2000, description: 'Maximum lines to return' },
          maxBytes: { type: 'integer', minimum: 256, maximum: 262144, description: 'Maximum bytes to return' },
          includeAnsi: { type: 'boolean', description: 'Whether to include ANSI control codes' }
        }
      },
      handler: async (args = {}) => service.getTerminalOutput(args)
    },
    {
      name: 'terminals.get_project_outputs',
      description: 'Get recent output from all terminals belonging to a project path.',
      inputSchema: {
        type: 'object',
        required: ['projectPath'],
        properties: {
          projectPath: { type: 'string', minLength: 1, description: 'Absolute project path' },
          linesPerTerminal: { type: 'integer', minimum: 1, maximum: 1000, description: 'Lines per terminal' },
          includeAnsi: { type: 'boolean', description: 'Whether to include ANSI control codes' }
        }
      },
      handler: async (args = {}) => service.getProjectTerminalOutputs(args)
    },
    {
      name: 'terminals.get_recent_errors',
      description: 'Extract recent error-like snippets from terminal output for diagnosis.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Optional absolute project path filter' },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum matches to return' }
        }
      },
      handler: async (args = {}) => service.getRecentTerminalErrors(args)
    }
  ]

  tools.push({
    name: 'terminals.tail',
    description: 'Read incremental terminal output after a cursor sequence.',
    inputSchema: {
      type: 'object',
      required: ['terminalId'],
      properties: {
        terminalId: { type: 'string', minLength: 1, description: 'Terminal session id' },
        cursor: { type: 'integer', minimum: 0, description: 'Last consumed line sequence cursor' },
        maxLines: { type: 'integer', minimum: 1, maximum: 2000, description: 'Maximum lines to return' },
        includeAnsi: { type: 'boolean', description: 'Whether to include ANSI control codes' }
      }
    },
    handler: async (args = {}) => service.tailTerminalOutput(args)
  })

  if (options.enableWrite) {
    tools.push({
      name: 'terminals.write',
      description: 'Write text into an existing OpenGit terminal session.',
      inputSchema: {
        type: 'object',
        required: ['terminalId', 'text'],
        properties: {
          terminalId: { type: 'string', minLength: 1, description: 'Terminal session id' },
          text: { type: 'string', description: 'Text to write into the terminal' },
          appendNewline: { type: 'boolean', description: 'Append a trailing newline before sending' }
        }
      },
      handler: async (args = {}) => service.writeTerminal(args)
    })
  }

  return tools
}

module.exports = {
  createTerminalsTools
}
