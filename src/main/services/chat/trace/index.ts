/**
 * Agent trace 基础设施。
 *
 * 提供决策级 trace 记录(TraceRecorder)、append-only jsonl 落盘(TraceWriter)、
 * token 粗估(TokenEstimator)。独立于调度逻辑,供 ReactLoopService/PlanExecuteService 注入。
 */
export type { TraceEvent, TraceRecord, ComplexityScore } from './TraceSchema'
export { TraceRecorder } from './TraceRecorder'
export type { TraceRecorderOptions } from './TraceRecorder'
export { TraceWriter, cleanupOldTraces } from './TraceWriter'
export type { TraceWriterOptions } from './TraceWriter'
export { TokenEstimator } from './TokenEstimator'
