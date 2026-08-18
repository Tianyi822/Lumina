import type { Resources } from '../zh'
import common from './common'
import paper from './paper'
import chrome from './chrome'
import settings from './settings'
import notifications from './notifications'
import knowledge from './knowledge'
import writer from './writer'

/** 英文语言资源：结构必须与 zh 完全一致（编译期类型约束） */
const en: Resources = { common, paper, chrome, settings, notifications, knowledge, writer }

export default en
