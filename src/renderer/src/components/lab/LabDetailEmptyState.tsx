import styles from './LabDetailEmptyState.module.css'

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
