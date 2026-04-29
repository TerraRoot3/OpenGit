const assert = require('assert')
const { createJsonRpcDispatcher } = require('../electron/mcp/server')

async function main() {
  const dispatch = createJsonRpcDispatcher({
    getRegisteredTools: () => [],
    safeError: () => {}
  })

  const init = await dispatch({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-test',
        version: '1.0.0'
      }
    }
  })

  assert.equal(init.statusCode, 200, 'initialize should succeed')
  assert.deepEqual(init.payload.result.capabilities, {
    tools: {},
    resources: {}
  })

  const resourcesList = await dispatch({
    jsonrpc: '2.0',
    id: 2,
    method: 'resources/list',
    params: {}
  })

  assert.equal(resourcesList.statusCode, 200, 'resources/list should succeed')
  assert.deepEqual(resourcesList.payload, {
    jsonrpc: '2.0',
    id: 2,
    result: {
      resources: []
    }
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
