function createSuccessResponse(data = {}, meta = {}) {
  return {
    ok: true,
    data,
    error: null,
    meta
  }
}

function createErrorResponse(code, message, details = null) {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      details
    }
  }
}

function createJsonRpcSuccess(id, result) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result
  }
}

function createJsonRpcError(id, code, message, data = null) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data == null ? {} : { data })
    }
  }
}

function createTextToolResult(payload, { isError = false } = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return {
    content: [
      {
        type: 'text',
        text
      }
    ],
    structuredContent: typeof payload === 'string' ? { message: payload } : payload,
    isError
  }
}

const commonInputSchemas = Object.freeze({
  projectPath: {
    type: 'string',
    minLength: 1,
    description: 'Absolute project path'
  },
  query: {
    type: 'string',
    minLength: 1,
    description: 'User-supplied search query'
  },
  pagination: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100
      },
      offset: {
        type: 'integer',
        minimum: 0
      }
    }
  }
})

module.exports = {
  createSuccessResponse,
  createErrorResponse,
  createJsonRpcSuccess,
  createJsonRpcError,
  createTextToolResult,
  commonInputSchemas
}
