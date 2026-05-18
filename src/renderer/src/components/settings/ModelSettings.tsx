import styles from './ModelSettings.module.css'

export default function ModelSettings() {
  return (
    <div className="sm-settings-page">
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">对话模型配置</h2>
        <p className="sm-settings-page__description">管理默认模型、接口地址与上下文参数。</p>
      </header>
      <div className={styles['model-settings']}>
        <p>模型配置功能 — 待完善</p>
      </div>
    </div>
  )
}
