// 编译期类型断言：守护 LabSessionPanelProps 契约
// 字段缺失时 T[K] 索引访问报 "Property does not exist"（Red）；
// 字段存在但类型不可赋值给 Expected 时，约束报错。
// 说明：原计划用 node:test 的 expectType，但 @types/node@25.2.3 未导出该符号，
// 故改用本文件内自包含的条件类型断言工具，编译期守护效果等价。
import type { LabSessionPanelProps } from './LabSessionPanel'
import type { LabDisciplineId } from '@shared/types/config'
import type { LabListItem } from '@renderer/types'

/** X 必须可赋值给 Expected，否则把实际类型塞进错误信息便于定位 */
type Extends<X, Expected> = [X] extends [Expected] ? ([Expected] extends [X] ? true : [X]) : [X]

/** 仅当条件为 true 时编译通过 */
type Assert<T extends true> = T

// --- discipline: LabDisciplineId | null ---
type _D = Assert<Extends<LabSessionPanelProps['discipline'], LabDisciplineId | null>>

// --- labId: string | null ---
type _L = Assert<Extends<LabSessionPanelProps['labId'], string | null>>

// --- enabledDisciplines: LabDisciplineId[] ---
type _E = Assert<Extends<LabSessionPanelProps['enabledDisciplines'], LabDisciplineId[]>>

// --- connectedLabs: LabListItem[] ---
type _C = Assert<Extends<LabSessionPanelProps['connectedLabs'], LabListItem[]>>

// --- disabled?: boolean ---
type _B = Assert<Extends<LabSessionPanelProps['disabled'], boolean | undefined>>

// --- onChange 是函数，签名为 (next: { discipline, labId }) => void ---
type _O = Assert<
  [Parameters<LabSessionPanelProps['onChange']>] extends [
    [{ discipline: LabDisciplineId | null; labId: string | null }]
  ]
    ? LabSessionPanelProps['onChange'] extends (...args: never[]) => unknown
      ? true
      : [LabSessionPanelProps['onChange']]
    : [Parameters<LabSessionPanelProps['onChange']>]
>

// 防止"未使用类型"误判（引用上述类型，确保被纳入编译期检查）
export type __LabSessionPanelAssertions = [_D, _L, _E, _C, _B, _O]
