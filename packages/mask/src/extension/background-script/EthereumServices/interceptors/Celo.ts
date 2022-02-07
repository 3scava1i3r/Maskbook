import type { JsonRpcPayload, JsonRpcResponse } from 'web3-core-helpers'
import type { Interceptor } from '../types'

export class CeloInterceptor implements Interceptor {
    encode(payload: JsonRpcPayload): JsonRpcPayload {
        throw new Error('Method not implemented.')
    }
    decode(error: Error | null, response?: JsonRpcResponse): [Error | null, JsonRpcResponse] {
        throw new Error('Method not implemented.')
    }
}
