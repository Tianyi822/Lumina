// 编译期类型断言：守护 SessionSelectionState / ChatRequest 新增实验室字段
// 字段缺失时 T[K] 索引访问报 "Property does not exist"（Red）；
// 字段存在但类型不可赋值给 Expected 时，约束 Extends<X, Expected> 报错。
// 不产生运行时代码。
//
// 说明：原计划用 node:test 的 expectType，但 @types/node@25.2.3 未导出该符号，
// 故改用本文件内自包含的条件类型断言工具，编译期守护效果等价。
import type { ChatRequest } from './chat'
import type { SessionSelectionState } from './session'
import type { LabDisciplineId } from './config'

/** X 必须可赋值给 Expected，否则把实际类型塞进错误信息便于定位 */
type Extends<X, Expected> = [X] extends [Expected] ? ([Expected] extends [X] ? true : [X]) : [X]

/** 仅当条件为 true 时编译通过 */
type Assert<T extends true> = T

// --- SessionSelectionState 字段断言 ---
type _SS1 = Assert<
  Extends<SessionSelectionState['activeLabDiscipline'], LabDisciplineId | null | undefined>
>
type _SS2 = Assert<Extends<SessionSelectionState['activeLabId'], string | null | undefined>>

// --- ChatRequest 字段断言 ---
type _CR1 = Assert<Extends<ChatRequest['activeLabDiscipline'], LabDisciplineId | null | undefined>>
type _CR2 = Assert<Extends<ChatRequest['activeLabId'], string | null | undefined>>

// 引用上述类型以避免 noUnusedLocals 误报，并确保它们被纳入编译期检查
export type __LabSessionTypeAssertions = [_SS1, _SS2, _CR1, _CR2]
