import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sshConfigService } from './SshConfigService'
import { getConfigDirPath } from '@main/services/config/configPaths'

const SSH_CONFIG_FILE = 'ssh-connections.json'

function cleanConfigFile(): void {
  const configDir = getConfigDirPath()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  const filePath = join(configDir, SSH_CONFIG_FILE)
  if (existsSync(filePath)) {
    rmSync(filePath)
  }
}

function readConfigFile(): Record<string, unknown>[] {
  const filePath = join(getConfigDirPath(), SSH_CONFIG_FILE)
  if (!existsSync(filePath)) return []
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>[]
}

test('SshConfigService', async (t) => {
  cleanConfigFile()

  await t.test('save 新配置成功', () => {
    cleanConfigFile()
    const result = sshConfigService.save({
      name: 'test-server',
      host: '1.2.3.4',
      port: 22,
      username: 'root',
      authType: 'password',
      password: 'secret'
    })

    assert.equal(result.success, true)
    assert.ok(result.config)
    assert.equal(result.config!.name, 'test-server')
    assert.equal(result.config!.host, '1.2.3.4')
    assert.equal(result.config!.port, 22)
    assert.equal(result.config!.username, 'root')
    assert.equal(result.config!.authType, 'password')
    assert.equal(result.config!.password, '********')
    assert.equal(typeof result.config!.id, 'string')
    assert.ok(result.config!.id.length > 0)
  })

  await t.test('save 重名返回错误', () => {
    cleanConfigFile()
    const common = {
      name: 'duplicate-server',
      host: '5.6.7.8',
      port: 22,
      username: 'admin',
      authType: 'password' as const,
      password: 'pass1'
    }

    const first = sshConfigService.save(common)
    assert.equal(first.success, true)

    const second = sshConfigService.save({
      ...common,
      host: '9.9.9.9',
      password: 'pass2'
    })
    assert.equal(second.success, false)
    assert.ok(second.error!.includes('配置名称已存在'))
  })

  await t.test('save 更新已有配置成功', () => {
    cleanConfigFile()
    const createResult = sshConfigService.save({
      name: 'update-server',
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authType: 'password',
      password: 'oldpass'
    })
    assert.equal(createResult.success, true)
    const configId = createResult.config!.id

    const updateResult = sshConfigService.save({
      id: configId,
      name: 'update-server-new',
      host: '10.0.0.2',
      port: 2222,
      username: 'newuser',
      authType: 'key',
      keyContent: 'my-private-key'
    })
    assert.equal(updateResult.success, true)
    assert.equal(updateResult.config!.name, 'update-server-new')
    assert.equal(updateResult.config!.host, '10.0.0.2')
    assert.equal(updateResult.config!.port, 2222)
    assert.equal(updateResult.config!.username, 'newuser')
    assert.equal(updateResult.config!.authType, 'key')
    assert.equal(updateResult.config!.keyContent, '********')
  })

  await t.test('save 更新不存在的配置返回错误', () => {
    cleanConfigFile()
    const result = sshConfigService.save({
      id: 'non-existent-id',
      name: 'ghost',
      host: '0.0.0.0',
      port: 22,
      username: 'nobody',
      authType: 'password',
      password: 'x'
    })
    assert.equal(result.success, false)
    assert.ok(result.error!.includes('配置不存在'))
  })

  await t.test('list 空列表返回空数组', () => {
    cleanConfigFile()
    const result = sshConfigService.list()
    assert.equal(result.success, true)
    assert.deepEqual(result.configs, [])
  })

  await t.test('list 返回脱敏配置', () => {
    cleanConfigFile()
    sshConfigService.save({
      name: 'sensitive-1',
      host: '1.1.1.1',
      port: 22,
      username: 'root',
      authType: 'password',
      password: 'my-secret-password'
    })
    sshConfigService.save({
      name: 'sensitive-2',
      host: '2.2.2.2',
      port: 2222,
      username: 'admin',
      authType: 'key',
      keyContent: 'my-private-key-content',
      passphrase: 'key-passphrase'
    })

    const result = sshConfigService.list()
    assert.equal(result.success, true)
    assert.equal(result.configs!.length, 2)

    for (const config of result.configs!) {
      if (config.password) assert.equal(config.password, '********')
      if (config.keyContent) assert.equal(config.keyContent, '********')
      if (config.passphrase) assert.equal(config.passphrase, '********')
    }
  })

  await t.test('get 存在/不存在的配置', () => {
    cleanConfigFile()
    const createResult = sshConfigService.save({
      name: 'get-test',
      host: '3.3.3.3',
      port: 22,
      username: 'test',
      authType: 'password',
      password: 'testpass'
    })
    assert.equal(createResult.success, true)
    const configId = createResult.config!.id

    const found = sshConfigService.get(configId)
    assert.equal(found.success, true)
    assert.equal(found.config!.name, 'get-test')
    assert.equal(found.config!.password, '********')

    const notFound = sshConfigService.get('bad-id')
    assert.equal(notFound.success, false)
    assert.ok(notFound.error!.includes('配置不存在'))
  })

  await t.test('delete 存在/不存在的配置', () => {
    cleanConfigFile()
    const createResult = sshConfigService.save({
      name: 'delete-me',
      host: '4.4.4.4',
      port: 22,
      username: 'del',
      authType: 'password',
      password: 'delpass'
    })
    assert.equal(createResult.success, true)
    const configId = createResult.config!.id

    const deleteResult = sshConfigService.delete(configId)
    assert.equal(deleteResult.success, true)

    const listAfter = sshConfigService.list()
    assert.deepEqual(listAfter.configs, [])

    const deleteAgain = sshConfigService.delete(configId)
    assert.equal(deleteAgain.success, false)
    assert.ok(deleteAgain.error!.includes('配置不存在'))

    const deleteNonExistent = sshConfigService.delete('no-such-id')
    assert.equal(deleteNonExistent.success, false)
    assert.ok(deleteNonExistent.error!.includes('配置不存在'))
  })

  await t.test('save 密码使用密钥认证时不存 password 字段', () => {
    cleanConfigFile()
    const result = sshConfigService.save({
      name: 'key-only',
      host: '6.6.6.6',
      port: 22,
      username: 'ec2-user',
      authType: 'key',
      keyContent: 'some-key'
    })
    assert.equal(result.success, true)

    const raw = readConfigFile()
    const saved = raw.find((c) => c.id === result.config!.id)
    assert.ok(saved)
    assert.equal(saved!.password, undefined)
  })

  await t.test('getDecrypted 返回解密后的配置', () => {
    cleanConfigFile()
    const createResult = sshConfigService.save({
      name: 'decrypt-test',
      host: '7.7.7.7',
      port: 22,
      username: 'admin',
      authType: 'password',
      password: 'actual-password'
    })
    assert.equal(createResult.success, true)
    const configId = createResult.config!.id

    const decrypted = sshConfigService.getDecrypted(configId)
    assert.equal(decrypted.success, true)
    assert.equal(decrypted.config!.password, 'actual-password')
  })

  await t.test('getDecrypted 不存在的配置返回错误', () => {
    const result = sshConfigService.getDecrypted('no-such-config')
    assert.equal(result.success, false)
    assert.ok(result.error!.includes('配置不存在'))
  })

  await t.test('密码存储在磁盘上经过加密', () => {
    cleanConfigFile()
    sshConfigService.save({
      name: 'encrypted-store',
      host: '8.8.8.8',
      port: 22,
      username: 'user',
      authType: 'password',
      password: 'plaintext-password'
    })

    const raw = readConfigFile()
    assert.equal(raw.length, 1)
    assert.notEqual(raw[0].password, 'plaintext-password')
    assert.ok(typeof raw[0].password === 'string')
    assert.ok((raw[0].password as string).length > 0)
  })

  await t.test('update 不传密码时保持原密码', () => {
    cleanConfigFile()
    const createResult = sshConfigService.save({
      name: 'keep-pass',
      host: '9.9.9.9',
      port: 22,
      username: 'user',
      authType: 'password',
      password: 'original-pass'
    })
    assert.equal(createResult.success, true)
    const configId = createResult.config!.id

    const rawBefore = readConfigFile()
    const savedPass = rawBefore[0].password as string

    const updateResult = sshConfigService.save({
      id: configId,
      name: 'keep-pass-updated',
      host: '10.10.10.10',
      port: 22,
      username: 'user',
      authType: 'password'
    })
    assert.equal(updateResult.success, true)

    const rawAfter = readConfigFile()
    assert.equal(rawAfter[0].password, savedPass)
  })

  await t.test('JSON 文件损坏时优雅降级返回空列表', () => {
    cleanConfigFile()
    const configDir = getConfigDirPath()
    const filePath = join(configDir, SSH_CONFIG_FILE)
    writeFileSync(filePath, '{ this is not valid json }', 'utf-8')

    const result = sshConfigService.list()
    assert.equal(result.success, true)
    assert.deepEqual(result.configs, [])
  })
})
