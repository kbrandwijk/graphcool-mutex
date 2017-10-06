import { GraphQLClient } from 'graphql-request'
import * as ws from 'ws'

let subscription: ws

export class Mutex {
  subscriptionHostname: string
  api: GraphQLClient
  projectId: string
  mutexId: number


  constructor(subscriptionHostname:string, api: GraphQLClient, projectId: string) {
    this.subscriptionHostname = subscriptionHostname
    this.api = api
    this.projectId = projectId
  }

  async acquire(name: string) {
      // Try to get the mutex
      const query = `query { Mutex(name: "${name}") { id } }`
      const result:any = await this.api.request(query)

      const existingMutex = result.Mutex != null

      if (existingMutex){
        this.mutexId = result.Mutex.id
        return setupSubscription(this.subscriptionHostname, name, this.projectId)
      }
      else {
        // Try to create the Mutex node
        const request = `mutation { createMutex(name: "${name}") { id } }`

        try {
          const result:any = await this.api.request(request)
          this.mutexId = result.createMutex.id
          return
        }
        catch(error){
          // Edge case where Mutex has been created in the meanwhile
          if (error.response.errors[0].code == 3010){
            return setupSubscription(this.subscriptionHostname, name, this.projectId)
          }
          else{
            throw new Error('Error creating Mutex record')
          }
        }
    }
  }

  release(name: string): void {
    if (subscription) {
      subscription.send(JSON.stringify({type: 'connection_terminate'}))
      subscription.close()
    }

    const request = `mutation { deleteMutex(id: "${this.mutexId}") { id } }`
    this.api.request(request).then(r => {return}).catch(e => {return})
  }
}

function setupSubscription(subscriptionHostname: string, name: string, projectId: string): Promise<object> {

  // Setup the subscription
  const subscriptionEndpoint = `wss://${subscriptionHostname}/v1/${projectId}`
  subscription = new ws(subscriptionEndpoint, { protocol: 'graphql-ws' })

  return new Promise(async function(resolve, reject) {
    const subscriptionRequest = `
      subscription {
        Mutex(filter: { mutation_in: [DELETED], node: { name: "${name}"}}){
          previousValues{ name }
        }
      }`

    subscription.on('open', () => {
      // Send connection_init message on connection open
      subscription.send(JSON.stringify({type: 'connection_init'}))
    })

    subscription.on('message', (data) => {
      const message = JSON.parse(data)
      // Server sends connection_ack after connection_init
      // Send the subscription request
      if (message.type == "connection_ack") {
        const message = JSON.stringify({id: 'sub1', type: 'start', payload: { query: `${subscriptionRequest}` }})
        subscription.send(message)
      }
      // Check for subscription result we are looking for
      if (message.type == "data" &&
          message.id == "sub1" &&
          message.payload.data.Mutex.previousValues.name == name) {
        resolve()
      }
    })
  })
}
