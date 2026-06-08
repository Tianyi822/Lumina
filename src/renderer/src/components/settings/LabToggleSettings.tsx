import SvgIcon from '@renderer/components/icons/SvgIcon'
import { useConfigStore } from '@renderer/stores'
import {
  isLabDisciplineEnabled,
  LAB_DISCIPLINE_PRESETS
} from '@shared/utils/labFeatures'
import styles from './LabToggleSettings.module.css'

export default function LabToggleSettings() {
  const labFeatures = useConfigStore((s) => s.labFeatures)
  const toggleLabDiscipline = useConfigStore((s) => s.toggleLabDiscipline)

  return (
    <div className={['sm-settings-page', styles['lab-toggle-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">学科实验室</h2>
        <p className="sm-settings-page__description">
          按学科独立启用实验室模块。开启后，侧边栏将显示对应学科入口。
        </p>
      </header>

      <section className="sm-settings-page__section">
        <div className={styles['discipline-list']}>
          {LAB_DISCIPLINE_PRESETS.map((preset) => {
            const enabled = isLabDisciplineEnabled(labFeatures, preset.id)

            return (
              <button
                key={preset.id}
                type="button"
                className={styles['lab-toggle']}
                aria-pressed={enabled}
                onClick={() => toggleLabDiscipline(preset.id)}
              >
                <span className={styles['lab-toggle__leading']}>
                  <SvgIcon name={preset.icon} size={24} />
                </span>

                <span className={styles['lab-toggle__copy']}>
                  <span className={styles['lab-toggle__title']}>{preset.label}</span>
                  <span className={styles['lab-toggle__desc']}>
                    {enabled
                      ? `${preset.label}实验室已启用，可在侧边栏访问。`
                      : preset.description}
                  </span>
                </span>

                <span className={styles['lab-toggle__control']} aria-hidden="true">
                  <span className={styles['lab-toggle__track']}>
                    <span className={styles['lab-toggle__thumb']} />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
