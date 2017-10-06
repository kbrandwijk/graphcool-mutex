import Graphcool, { fromEvent } from 'graphcool-lib'
import * as ws from 'ws'

export function withMutex(graphcool: any, region?:string) {
  graphcool.mutex = new Mutex(graphcool)

  if (region) {
    graphcool.mutex.subscriptionHostname = subscriptionEndpoints[region]
    return graphcool
  }
  else {
    const regionRequest = `
    query{
      viewer{
        project(id: "${graphcool.projectId}") {
          region
        }
      }
    }`

    const systemClient = graphcool.systemClient()
    systemClient.options.headers = { Authorization: `Bearer ${graphcool.pat}`}

    return systemClient.request(regionRequest).then(res => {
      graphcool.mutex.subscriptionHostname = subscriptionEndpoints[res.viewer.project.region]
      return graphcool
    })
  }
}

export default class Mutex {
  subscriptionHostname: string
  api: any
  projectId: string
  mutexId: number

  constructor(graphcool) {
    this.api = graphcool.api('simple/v1')
    this.projectId = graphcool.projectId
  }

  async acquire(mutexName: string) {
    // Try to create the Mutex node
    //console.log('creating new mutex')
    const request = `mutation { createMutex(name: "${mutexName}") { id } }`

    try {
      const result:any = await this.api.request(request)
      this.mutexId = result.createMutex.id
      //console.log('mutex created with id ' + this.mutexId)
      return
    }
    catch(error){
      // Existing Mutex lock
      if (error.response.errors[0].code == 3010){
        //console.log('existing mutex lock')
        await setupSubscription(this.subscriptionHostname, this.projectId, mutexName)
        await this.acquire(mutexName)
        return
      }
      else{
        throw new Error('Error creating Mutex record')
      }
    }
  }

  release(): void {
    const request = `mutation { deleteMutex(id: "${this.mutexId}") { id } }`
    //console.log('deleting mutex with id ' + this.mutexId)
    this.api.request(request).then(r => {return}).catch(e => {return})
  }
}

async function setupSubscription(subscriptionHostname, projectId, mutexName): Promise<object> {
  // Setup the subscription
  const subscriptionEndpoint:string = `wss://${subscriptionHostname}/v1/${projectId}`
  const subscription:ws = new ws(subscriptionEndpoint, { protocol: 'graphql-ws' })

  return new Promise((resolve, reject) => {
    const subscriptionRequest:string = `
      subscription {
        Mutex(filter: { mutation_in: [DELETED], node: { name: "${mutexName}"}}){
          previousValues{ name }
        }
      }`

    subscription.on('open', () => {
      // Send connection_init message on connection open
      subscription.send(JSON.stringify({type: 'connection_init'}))
    })

    subscription.on('message', async (data) => {
      const message:any = JSON.parse(data)
      // Server sends connection_ack after connection_init
      // Send the subscription request
      if (message.type == "connection_ack") {
        const message = JSON.stringify({id: 'mutexSubscription', type: 'start', payload: { query: `${subscriptionRequest}` }})
        subscription.send(message)
        //console.log('waiting for subscription delete message')
      }
      // Check for subscription result we are looking for
      if (message.type == "data" &&
          message.id == "mutexSubscription" &&
          message.payload.data.Mutex.previousValues.name == mutexName) {
            subscription.send(JSON.stringify({type: 'connection_terminate'}))
            subscription.close()
            //console.log('delete message received')
            resolve()
      }
    })
  })
}

const subscriptionEndpoints = {
  EU_WEST_1: 'subscriptions.graph.cool',
  US_WEST_2: 'subscriptions.us-west-2.graph.cool',
  AP_NORTHEAST_1: 'subscriptions.ap-northeast-1.graph.cool',
}
