// 文件管理 Store
// 管理文件列表、上传、删除、关联知识库等功能

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { FileItem } from '@renderer/types'

export const useFileStore = defineStore('fileStore', () => {
  // 文件列表
  const files = ref<FileItem[]>([])

  // 加载状态
  const loading = ref(false)

  // 搜索关键词
  const searchQuery = ref('')

  // 过滤后的文件列表（前端实时过滤）
  const filteredFiles = computed(() => {
    if (!searchQuery.value.trim()) {
      return files.value
    }
    const query = searchQuery.value.toLowerCase()
    return files.value.filter((f) => f.name.toLowerCase().includes(query))
  })

  // 加载所有文件列表
  async function loadFiles(): Promise<void> {
    try {
      loading.value = true
      const result = await window.api.file.list()
      if (result.success && result.data) {
        files.value = result.data
      } else {
        console.error('加载文件列表失败:', result.error)
      }
    } catch (error) {
      console.error('加载文件列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 搜索文件（更新搜索关键词）
  function searchFiles(query: string): void {
    searchQuery.value = query
  }

  // 上传单个文件
  async function uploadFile(
    file: File
  ): Promise<{ success: boolean; file?: FileItem; isDuplicate?: boolean; error?: string }> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const result = await window.api.file.upload({
        data: uint8Array,
        name: file.name
      })

      if (result.success && result.file) {
        if (!result.isDuplicate) {
          files.value.unshift(result.file)
        }
        return {
          success: true,
          file: result.file,
          isDuplicate: result.isDuplicate
        }
      }

      return {
        success: false,
        error: result.error || '上传失败'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('上传文件失败:', error)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  // 批量上传文件
  async function uploadFiles(
    filesParam: File[]
  ): Promise<{ success: boolean; uploaded: FileItem[]; errors: string[]; duplicates: FileItem[] }> {
    const uploaded: FileItem[] = []
    const errors: string[] = []
    const duplicates: FileItem[] = []

    for (const file of filesParam) {
      const result = await uploadFile(file)
      if (result.success) {
        if (result.isDuplicate && result.file) {
          duplicates.push(result.file)
        } else if (result.file) {
          uploaded.push(result.file)
        }
      } else {
        errors.push(`${file.name}: ${result.error || '上传失败'}`)
      }
    }

    return {
      success: uploaded.length > 0 || duplicates.length > 0,
      uploaded,
      errors,
      duplicates
    }
  }

  // 删除文件
  async function deleteFile(
    fileId: string,
    forceDelete?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.file.delete(fileId, forceDelete)
      if (result.success) {
        files.value = files.value.filter((f) => f.id !== fileId)
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('删除文件失败:', error)
      return { success: false, error: errorMessage }
    }
  }

  // 将文件关联到知识库
  async function linkFileToKB(
    fileId: string,
    kbId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.file.linkToKB(fileId, kbId)
      if (result.success) {
        const file = files.value.find((f) => f.id === fileId)
        if (file && !file.usedByKBIds.includes(kbId)) {
          file.usedByKBIds.push(kbId)
        }
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('关联文件失败:', error)
      return { success: false, error: errorMessage }
    }
  }

  // 从知识库取消文件关联
  async function unlinkFileFromKB(
    fileId: string,
    kbId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.file.unlinkFromKB(fileId, kbId)
      if (result.success) {
        const file = files.value.find((f) => f.id === fileId)
        if (file) {
          file.usedByKBIds = file.usedByKBIds.filter((id) => id !== kbId)
        }
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('取消关联失败:', error)
      return { success: false, error: errorMessage }
    }
  }

  // 获取知识库关联的文件列表
  async function getFilesByKBId(kbId: string): Promise<FileItem[]> {
    try {
      const result = await window.api.file.getByKBId(kbId)
      if (result.success && result.data) {
        return result.data
      }
      console.error('获取知识库文件列表失败:', result.error)
      return []
    } catch (error) {
      console.error('获取知识库文件列表失败:', error)
      return []
    }
  }

  // 获取文件使用情况
  async function getFileUsage(fileId: string): Promise<string[]> {
    try {
      const result = await window.api.file.getUsage(fileId)
      if (result.success && result.data) {
        return result.data
      }
      return []
    } catch (error) {
      console.error('获取文件使用情况失败:', error)
      return []
    }
  }

  // 格式化文件大小
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 格式化日期（2025/02/03）
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}/${month}/${day}`
  }

  return {
    files,
    loading,
    searchQuery,
    filteredFiles,
    loadFiles,
    searchFiles,
    uploadFile,
    uploadFiles,
    deleteFile,
    linkFileToKB,
    unlinkFileFromKB,
    getFilesByKBId,
    getFileUsage,
    formatFileSize,
    formatDate
  }
})
