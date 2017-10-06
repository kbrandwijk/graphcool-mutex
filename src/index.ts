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

class Mutex {
  subscriptionHostname: string
  api: any
  projectId: string
  mutexId: number
  subscription: ws

  constructor(graphcool) {
    this.api = graphcool.api('simple/v1')
    this.projectId = graphcool.projectId
  }

  async acquire(mutexName: string) {
    // Fist, set up the subscription
    // Setup the subscription
    const subscriptionEndpoint:string = `wss://${this.subscriptionHostname}/v1/${this.projectId}`
    this.subscription = new ws(subscriptionEndpoint, { protocol: 'graphql-ws' })

    const result = await new Promise(async (resolve, reject) => {
      const subscriptionRequest:string = `
        subscription {
          Mutex(filter: { mutation_in: [DELETED], node: { name: "${mutexName}"}}){
            previousValues{ name }
          }
        }`

      this.subscription.on('open', () => {
        // Send connection_init message on connection open
        this.subscription.send(JSON.stringify({type: 'connection_init'}))
      })

      this.subscription.on('message', async (data) => {
        const message:any = JSON.parse(data)
        // Server sends connection_ack after connection_init
        // Send the subscription request
        if (message.type == "connection_ack") {
          const message = JSON.stringify({id: 'mutexSubscription', type: 'start', payload: { query: `${subscriptionRequest}` }})
          this.subscription.send(message)

          // Try to create the Mutex initially. Will close the subscription if successful
          if (await this.tryCreateMutex(mutexName)) resolve()
        }
        // Check for subscription result we are looking for
        if (message.type == "data" &&
            message.id == "mutexSubscription" &&
            message.payload.data.Mutex.previousValues.name == mutexName) {
              // Mutex was released, try to create it, if not, keep waiting
              if (await this.tryCreateMutex(mutexName)) resolve()
        }
      })
    })
  }

  async tryCreateMutex(mutexName: string) {
    // Try to create the Mutex node
    const request = `mutation { createMutex(name: "${mutexName}") { id } }`

    try {
      // If it doesn't exist, we can close the subscription and continue
      const result:any = await this.api.request(request)
      this.mutexId = result.createMutex.id
      this.subscription.send(JSON.stringify({type: 'connection_terminate'}))
      this.subscription.close()
      return true
    }
    catch(error){
      // Existing Mutex lock would cause 3010. In that case, we do nothing
      // and just use the subscription
      if (error.response.errors[0].code != 3010){
        this.subscription.send(JSON.stringify({type: 'connection_terminate'}))
        this.subscription.close()
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

const subscriptionEndpoints = {
  EU_WEST_1: 'subscriptions.graph.cool',
  US_WEST_2: 'subscriptions.us-west-2.graph.cool',
  AP_NORTHEAST_1: 'subscriptions.ap-northeast-1.graph.cool',
}
