import { parentPort } from 'worker_threads'
import { encode } from 'gpt-tokenizer/encoding/cl100k_base'

interface TokenEstimationRequest {
  id: string
  texts: string[]
}

parentPort?.on('message', ({ id, texts }: TokenEstimationRequest) => {
  const estimates = texts.map((text) => encode(text).length)
  parentPort?.postMessage({ id, estimates })
})
