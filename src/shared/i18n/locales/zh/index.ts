import common from './common'
import paper from './paper'
import chrome from './chrome'
import settings from './settings'
import notifications from './notifications'
import knowledge from './knowledge'
import writer from './writer'

/** 中文语言资源（基准）：新增 key 先加在这里，en 结构与之同构 */
const zh = { common, paper, chrome, settings, notifications, knowledge, writer }

/** 资源结构类型：en 以此约束，编译期保证 key 对齐 */
export type Resources = typeof zh

export default zh
