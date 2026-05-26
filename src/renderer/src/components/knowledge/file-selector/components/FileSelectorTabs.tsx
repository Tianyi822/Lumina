import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './FileSelectorTabs.module.css'

type TabType = 'existing' | 'upload'

interface FileSelectorTabsProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export default function FileSelectorTabs({ activeTab, onTabChange }: FileSelectorTabsProps) {
  return (
    <div className={styles['file-selector-tabs']} role="tablist" aria-label="文件添加方式">
      <button
        type="button"
        role="tab"
        className={`${styles['file-selector-tabs__item']} ${activeTab === 'existing' ? styles['is-active'] : ''}`}
        aria-selected={activeTab === 'existing'}
        onClick={() => onTabChange('existing')}
      >
        <SvgIcon name="attachment" size={14} />
        <span>从已有文件选择</span>
      </button>
      <button
        type="button"
        role="tab"
        className={`${styles['file-selector-tabs__item']} ${activeTab === 'upload' ? styles['is-active'] : ''}`}
        aria-selected={activeTab === 'upload'}
        onClick={() => onTabChange('upload')}
      >
        <SvgIcon name="upload" size={14} />
        <span>上传新文件</span>
      </button>
    </div>
  )
}
