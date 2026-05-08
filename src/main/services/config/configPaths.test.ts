import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'path'

// 注意：测试通过 tsAliasLoader 运行，electron 已被 mock
// process.platform 不可写，因此仅测试路径拼接逻辑和导出常量

describe('configPaths', () => {
  it('导出目录名称常量正确', async () => {
    const {
      CONFIG_DIR_NAME,
      KNOWLEDGE_DIR_NAME,
      CONFIG_FILE_NAME,
      DATA_DIR_NAME,
      VECTOR_DB_DIR_NAME
    } = await import('./configPaths')

    assert.equal(CONFIG_DIR_NAME, '.lumina')
    assert.equal(KNOWLEDGE_DIR_NAME, 'knowledge')
    assert.equal(CONFIG_FILE_NAME, 'config.json')
    assert.equal(DATA_DIR_NAME, 'data')
    assert.equal(VECTOR_DB_DIR_NAME, 'db')
  })

  it('getConfigDirPath 返回以 .lumina 结尾的路径', async () => {
    const { getConfigDirPath } = await import('./configPaths')
    const path = getConfigDirPath()
    assert.ok(path.endsWith('.lumina'))
  })

  it('getKnowledgeDirPath 返回 configDir/knowledge', async () => {
    const { getConfigDirPath, getKnowledgeDirPath } = await import('./configPaths')
    const configDir = getConfigDirPath()
    const knowledgeDir = getKnowledgeDirPath()
    assert.equal(knowledgeDir, join(configDir, 'knowledge'))
  })

  it('getDataDirPath 返回 knowledge/data', async () => {
    const { getDataDirPath, getKnowledgeDirPath } = await import('./configPaths')
    const knowledgeDir = getKnowledgeDirPath()
    assert.equal(getDataDirPath(), join(knowledgeDir, 'data'))
  })

  it('getVectorDBDirPath 返回 knowledge/data/db', async () => {
    const { getVectorDBDirPath, getDataDirPath } = await import('./configPaths')
    const dataDir = getDataDirPath()
    assert.equal(getVectorDBDirPath(), join(dataDir, 'db'))
  })

  it('getConfigFilePath 返回 configDir/config.json', async () => {
    const { getConfigDirPath, getConfigFilePath } = await import('./configPaths')
    const configDir = getConfigDirPath()
    assert.equal(getConfigFilePath(), join(configDir, 'config.json'))
  })

  it('在 macOS 上注册表函数不影响结果（getConfigDirPath 回退到默认路径）', async () => {
    const { getConfigDirPath } = await import('./configPaths')
    const path = getConfigDirPath()
    // macOS 不会读取注册表，始终返回 ~/.lumina
    assert.ok(path.endsWith('.lumina'))
    assert.ok(!path.includes('DataPath'))
  })
})
