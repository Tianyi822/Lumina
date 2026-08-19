import type { ParseKeys } from 'i18next'

/** 写作域操作名翻译 key（notifications.writer.operations.*），writerHandlers/WriterService/WriterStorageService 复用 */
export type WriterOperationKey = Extract<ParseKeys, `notifications.writer.operations.${string}`>
