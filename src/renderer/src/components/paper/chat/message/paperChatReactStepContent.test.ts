import test from 'node:test'
import assert from 'node:assert/strict'
import { derivePaperChatStepContent } from './paperChatReactStepContent'

test('工具失败时不生成重复阶段摘要', () => {
  const result = derivePaperChatStepContent(
    [
      {
        name: 'write_project_files',
        serverName: 'lab',
        status: 'error',
        error: '写入文件失败'
      }
    ],
    '依赖安装成功。现在批量创建所有组件、页面和数据文件。'
  )

  assert.equal(result, null)
})

test('工具全部成功时不生成成功摘要', () => {
  const result = derivePaperChatStepContent(
    [
      {
        name: 'create_frontend_lab',
        serverName: 'lab',
        status: 'success'
      },
      {
        name: 'search',
        serverName: 'paper_web',
        status: 'success'
      }
    ],
    '模型原始阶段说明'
  )

  assert.equal(result, null)
})

test('运行中且没有模型正文时显示执行提示', () => {
  const result = derivePaperChatStepContent(
    [
      {
        name: 'write_project_files',
        serverName: 'lab',
        status: 'running'
      },
      {
        name: 'search',
        serverName: 'paper_web',
        status: 'pending'
      }
    ],
    ''
  )

  assert.equal(result?.tone, 'neutral')
  assert.match(result?.content ?? '', /执行中/)
  assert.match(result?.content ?? '', /write_project_files/)
  assert.doesNotMatch(result?.content ?? '', /paper_web\/search/)
})

test('等待中且没有模型正文时显示等待提示', () => {
  const result = derivePaperChatStepContent(
    [
      {
        name: 'write_project_files',
        serverName: 'lab',
        status: 'pending'
      },
      {
        name: 'search',
        serverName: 'paper_web',
        status: 'pending'
      }
    ],
    ''
  )

  assert.equal(result?.tone, 'neutral')
  assert.match(result?.content ?? '', /等待执行/)
  assert.match(result?.content ?? '', /write_project_files/)
  assert.match(result?.content ?? '', /paper_web\/search/)
})

test('运行中但已有模型正文时不生成执行提示', () => {
  const result = derivePaperChatStepContent(
    [
      {
        name: 'write_project_files',
        serverName: 'lab',
        status: 'running'
      }
    ],
    '模型已经开始输出正文。'
  )

  assert.equal(result, null)
})

test('没有工具调用时展示普通模型文本', () => {
  const content = '这是纯文本阶段结果。\n\n继续分析论文内容。'
  const result = derivePaperChatStepContent([], content)

  assert.notEqual(result, null)
  assert.equal(result?.tone, 'neutral')
  assert.equal(result?.content, content)
})

test('没有工具结果但阶段内容标记失败时使用错误状态', () => {
  const result = derivePaperChatStepContent([], '**执行失败**\n\n步骤执行超时')

  assert.equal(result?.tone, 'error')
  assert.match(result?.content ?? '', /步骤执行超时/)
})

test('多工具混合成功失败时不生成重复阶段摘要', () => {
  const result = derivePaperChatStepContent(
    [
      {
        name: 'create_frontend_lab',
        serverName: 'lab',
        status: 'success'
      },
      {
        name: 'write_project_files',
        serverName: 'lab',
        status: 'error',
        error: '目标路径不存在'
      }
    ],
    '文件已经全部写入成功。'
  )

  assert.equal(result, null)
})
