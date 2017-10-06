'use latest'
require('babel-polyfill')
const { withMutex } = require('@agartha/graphcool-mutex')
const { fromEvent } = require('graphcool-lib')

module.exports = async (event) => {
  event.context = { graphcool: {
    projectId: "__PROJECT_ID__",
    pat: "__PAT__"
  }}

  const graphcool = await withMutex(fromEvent(event))
  const api = graphcool.api('simple/v1')

  await graphcool.mutex.acquire('increment')

  const request = `
    query {
      Post(id: "${event.data.id}") { version }
    }
  `
  const result = await api.request(request)
  const { version } = result.Post

  event.data.version = version + 1

  graphcool.mutex.release('increment')

  return { data: event.data }
}
