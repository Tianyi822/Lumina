import styles from './LabDetailEmptyState.module.css'

/** 实验室详情页的空白占位组件，显示提示标题和描述文字 */
interface LabDetailEmptyStateProps {
  title: string
  message: string
}

export default function LabDetailEmptyState({ title, message }: LabDetailEmptyStateProps) {
  return (
    <div className={styles['detail-empty-state']}>
      <div className={`sm-empty ${styles['detail-empty-card']}`}>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </div>
  )
}
