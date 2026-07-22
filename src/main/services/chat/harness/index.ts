/**
 * Lumina Agent trace 基础设施。
 *
 * 提供决策级 trace 记录（TraceRecorder）、append-only jsonl 落盘（TraceWriter）、
 * token 粗估（TokenEstimator）。独立于调度逻辑，供 ReactLoopService/PlanExecuteService 注入。
 */
export type { TraceEvent, TraceRecord, ComplexityScore, SessionType, EngineKind } from './trace/TraceSchema'
export { TraceRecorder } from './trace/TraceRecorder'
export type { TraceRecorderOptions } from './trace/TraceRecorder'
export { TraceWriter, cleanupOldTraces } from './trace/TraceWriter'
export type { TraceWriterOptions } from './trace/TraceWriter'
export { TokenEstimator } from './trace/TokenEstimator'
