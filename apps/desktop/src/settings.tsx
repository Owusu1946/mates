import { useEffect, useRef, useState } from 'react'
import { team } from './team'
import type { Mate } from './team'
import './settings.css'

const sections = ['Workspace', 'Activity', 'Shortcuts'] as const

export function SettingsDialog({ starterMate, showDates, onStarterChange, onDatesChange, onClose }: {
  starterMate: Mate
  showDates: boolean
  onStarterChange: (mate: Mate) => boolean
  onDatesChange: (show: boolean) => boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [section, setSection] = useState<(typeof sections)[number]>('Workspace')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
    closeButton.current?.focus()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      <div className="settings-layout">
        <header className="settings-header">
          <h1 id="settings-title">Settings</h1>
          <button
            ref={closeButton}
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={() => dialog.current?.close()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((name) => (
            <button
              key={name}
              type="button"
              aria-current={section === name ? 'true' : undefined}
              onClick={() => {
                setSection(name)
                setFailed(false)
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <section className="settings-panel" aria-labelledby="settings-section">
          <h2 id="settings-section">{section}</h2>

          {section === 'Workspace' && (
            <fieldset className="settings-fieldset" aria-describedby="starter-mate-description">
              <legend>First mate on launch</legend>
              <p id="starter-mate-description">Choose which mate is selected when you reopen Mates.</p>
              <div className="settings-mates">
                {team.map((mate) => (
                  <label className="settings-mate" key={mate.name}>
                    <img src={mate.image} alt="" width="26" height="26" />
                    <span>{mate.name}</span>
                    <input
                      name="startup-mate"
                      type="radio"
                      checked={starterMate === mate}
                      onChange={() => setFailed(!onStarterChange(mate))}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {section === 'Activity' && (
            <label className="settings-toggle-row">
              <span>
                <strong>Draft timestamps</strong>
                <span>Show when each draft was last saved.</span>
              </span>
              <input
                className="settings-switch"
                type="checkbox"
                role="switch"
                aria-label="Draft timestamps"
                checked={showDates}
                onChange={(event) => setFailed(!onDatesChange(event.target.checked))}
              />
            </label>
          )}

          {section === 'Shortcuts' && (
            <dl className="settings-shortcuts">
              <div>
                <dt>Open commands</dt>
                <dd><kbd>Ctrl</kbd> or <kbd>Cmd</kbd> + <kbd>K</kbd></dd>
              </div>
              <div>
                <dt>Save a draft</dt>
                <dd><kbd>Ctrl</kbd> or <kbd>Cmd</kbd> + <kbd>Enter</kbd></dd>
              </div>
              <div>
                <dt>Dismiss a dialog or menu</dt>
                <dd><kbd>Esc</kbd></dd>
              </div>
            </dl>
          )}
          {failed && <p className="save-error" role="alert">Could not save this preference. Try again.</p>}
        </section>
      </div>
    </dialog>
  )
}
