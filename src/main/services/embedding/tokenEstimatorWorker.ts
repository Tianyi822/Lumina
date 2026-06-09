import { parentPort } from 'worker_threads'
import { encode } from 'gpt-tokenizer/encoding/cl100k_base'

/**
 * Worker 线程消息接口
 */
interface TokenEstimationRequest {
  id: string
  texts: string[]
}

/**
 * Worker 线程主处理逻辑
 * 接收主线程发送的文本列表，估算每个文本的 Token 数后返回
 */
parentPort?.on('message', ({ id, texts }: TokenEstimationRequest) => {
  const estimates = texts.map((text) => encode(text).length)
  parentPort?.postMessage({ id, estimates })
})
