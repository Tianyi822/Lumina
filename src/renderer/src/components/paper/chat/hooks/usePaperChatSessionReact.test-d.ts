// 编译期类型断言：守护 usePaperChatSessionReact 返回值新增实验室字段
// 字段缺失时 T[K] 索引访问报 "Property does not exist"（Red）；
// 字段存在但类型不可赋值给 Expected 时，约束 Extends<X, Expected> 报错。
// 说明：原计划用 node:test 的 expectType，但 @types/node@25.2.3 未导出该符号，
// 故改用本文件内自包含的条件类型断言工具，编译期守护效果等价。
import type { usePaperChatSessionReact } from './usePaperChatSessionReact'
import type { LabDisciplineId } from '@shared/types/config'

type Ret = ReturnType<typeof usePaperChatSessionReact>

/** X 必须可赋值给 Expected，否则把实际类型塞进错误信息便于定位 */
type Extends<X, Expected> = [X] extends [Expected] ? ([Expected] extends [X] ? true : [X]) : [X]

/** 仅当条件为 true 时编译通过 */
type Assert<T extends true> = T

// --- activeLabDiscipline: LabDisciplineId | null ---
type _D = Assert<Extends<Ret['activeLabDiscipline'], LabDisciplineId | null>>

// --- activeLabId: string | null ---
type _L = Assert<Extends<Ret['activeLabId'], string | null>>

// --- updateLabSelection 签名为 (discipline: LabDisciplineId | null, labId: string | null) => void ---
type _U = Assert<
  [Parameters<Ret['updateLabSelection']>] extends [[LabDisciplineId | null, string | null]]
    ? Ret['updateLabSelection'] extends (...args: never[]) => unknown
      ? true
      : [Ret['updateLabSelection']]
    : [Parameters<Ret['updateLabSelection']>]
>

// 防止"未使用类型"误判（引用上述类型，确保被纳入编译期检查）
export type __UsePaperChatSessionLabAssertions = [_D, _L, _U]
