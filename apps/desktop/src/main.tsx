import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import brand from '../../../brand/mates-avatar.png'
import { loadDrafts, storeDrafts } from './drafts'
import type { Draft } from './drafts'
import { CommandPalette } from './command-palette'
import { Conversation } from './conversation'
import { EntryFlow } from './entry-flow'
import { SettingsDialog } from './settings'
import { team } from './team'
import type { Mate } from './team'
import './styles.css'

const views = ['Chat', 'Activity'] as const
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const draftLimit = 4000

type Editor = { mate: Mate; draft?: Draft }

function DraftEditor({ editor, onClose, onSave, onDelete }: {
  editor: Editor
  onClose: () => void
  onSave: (text: string) => boolean
  onDelete: (draft: Draft) => boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const keepEditing = useRef<HTMLButtonElement>(null)
  const [text, setText] = useState(editor.draft?.text ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    if (confirmingDelete) keepEditing.current?.focus()
    else textarea.current?.focus()
  }, [confirmingDelete])

  function showDeleteConfirmation(show: boolean) {
    setFailed(false)
    setConfirmingDelete(show)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = text.trim()
    if (!body) return
    if (onSave(body)) {
      dialog.current?.close()
    } else {
      setFailed(true)
    }
  }

  if (confirmingDelete && editor.draft) {
    const draft = editor.draft
    return (
      <dialog
        ref={dialog}
        className="draft-dialog"
        aria-labelledby="draft-heading"
        aria-describedby="delete-description"
        onClose={onClose}
        onCancel={(event) => {
          event.preventDefault()
          showDeleteConfirmation(false)
        }}
      >
        <div className="draft-heading">
          <div>
            <h2 id="draft-heading">Delete this draft?</h2>
            <p id="delete-description">This removes the saved request for {editor.mate.name} from Activity.</p>
          </div>
        </div>
        {failed && <p className="save-error" role="alert">Could not delete the draft on this device. Try again.</p>}
        <div className="draft-actions">
          <button ref={keepEditing} type="button" className="secondary-button" onClick={() => showDeleteConfirmation(false)}>
            Keep draft
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              if (onDelete(draft)) dialog.current?.close()
              else setFailed(true)
            }}
          >
            Delete draft
          </button>
        </div>
      </dialog>
    )
  }

  return (
    <dialog ref={dialog} className="draft-dialog" aria-labelledby="draft-heading" onClose={onClose}>
      <form
        onSubmit={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
            event.preventDefault()
            event.currentTarget.requestSubmit()
          }
        }}
      >
        <div className="draft-heading">
          <span className="avatar" data-color={editor.mate.color}>
            <img src={editor.mate.image} alt="" width="38" height="38" />
          </span>
          <div>
            <h2 id="draft-heading">Request for {editor.mate.name}</h2>
            <p>Save a draft on this device.</p>
          </div>
        </div>
        <label htmlFor="request-body">What should {editor.mate.name} help with?</label>
        <textarea
          id="request-body"
          ref={textarea}
          rows={5}
          maxLength={draftLimit}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {!editor.draft && (
          <button
            type="button"
            className="text-button"
            disabled={text.trim().length > 0}
            onClick={() => {
              setText(editor.mate.prompt)
              textarea.current?.focus()
            }}
          >
            Use an example
          </button>
        )}
        {failed && <p className="save-error" role="alert">Could not save the draft on this device. Try again.</p>}
        <div className="draft-actions">
          {editor.draft && (
            <button type="button" className="delete-link" onClick={() => showDeleteConfirmation(true)}>
              Delete draft
            </button>
          )}
          <button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={!text.trim()}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title="Save draft (Ctrl or Cmd + Enter)"
          >
            Save draft
          </button>
        </div>
      </form>
    </dialog>
  )
}

function MateFilter({ value, onChange }: {
  value: string
  onChange: (value: string) => void
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const selectedMate = team.find((mate) => mate.name === value)
  const options = [
    { value: '', label: 'All mates' },
    ...team.map((mate) => ({ value: mate.name, label: mate.name, mate })),
  ]

  return (
    <div className="activity-filter">
      <span id="mate-filter-label">Filter by mate</span>
      <button
        ref={trigger}
        className="secondary-button filter-trigger"
        type="button"
        popoverTarget="mate-filter-options"
        aria-labelledby="mate-filter-label mate-filter-value"
      >
        <span id="mate-filter-value" className="filter-value">
          {selectedMate && <img src={selectedMate.image} alt="" width="22" height="22" />}
          {selectedMate?.name ?? 'All mates'}
        </span>
        <span className="filter-chevron" aria-hidden="true" />
      </button>
      <div
        ref={popover}
        id="mate-filter-options"
        className="filter-options"
        popover="auto"
        role="group"
        aria-labelledby="mate-filter-label"
        onToggle={(event) => {
          if (event.newState === 'open') {
            event.currentTarget.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
          }
        }}
        onKeyDown={(event) => {
          const buttons = Array.from(event.currentTarget.querySelectorAll('button'))
          const focused = buttons.findIndex((button) => button === document.activeElement)
          const last = buttons.length - 1
          let next: number
          switch (event.key) {
            case 'ArrowDown':
              next = focused === last ? 0 : focused + 1
              break
            case 'ArrowUp':
              next = focused <= 0 ? last : focused - 1
              break
            case 'Home':
              next = 0
              break
            case 'End':
              next = last
              break
            default:
              return
          }
          event.preventDefault()
          buttons[next]?.focus()
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => {
              onChange(option.value)
              popover.current?.hidePopover()
              trigger.current?.focus()
            }}
          >
            {'mate' in option && <img src={option.mate.image} alt="" width="22" height="22" />}
            <span>{option.label}</span>
            {value === option.value && <span className="filter-check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

const showDatesKey = 'mates.activity-show-dates.v1'

function loadShowDates() {
  try {
    return localStorage.getItem(showDatesKey) !== 'false'
  } catch {
    return true
  }
}

function Workspace({ initialMate, onOpenAccount, onStarterChange }: {
  initialMate: Mate
  onOpenAccount: () => void
  onStarterChange: (mate: Mate) => boolean
}) {
  const [view, setView] = useState<(typeof views)[number]>('Chat')
  const [selectedMate, setSelectedMate] = useState<Mate>(initialMate)
  const [drafts, setDrafts] = useState(loadDrafts)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const commandButton = useRef<HTMLButtonElement>(null)
  const commandShortcut = navigator.userAgent.includes('Macintosh') ? '⌘ K' : 'Ctrl K'

  useEffect(() => {
    function openCommands(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
        && commandButton.current?.getClientRects().length && !document.querySelector('dialog:modal')) {
        event.preventDefault()
        setCommandsOpen(true)
      }
    }

    window.addEventListener('keydown', openCommands)
    return () => window.removeEventListener('keydown', openCommands)
  }, [])
  const [showDates, setShowDates] = useState(loadShowDates)
  const [composerText, setComposerText] = useState<Partial<Record<Mate['name'], string>>>({})
  const composer = useRef<HTMLTextAreaElement>(null)
  const activityHeading = useRef<HTMLHeadingElement>(null)
  const visibleDrafts = filter ? drafts.filter((draft) => draft.mate === filter) : drafts
  const mateDrafts = drafts.filter((draft) => draft.mate === selectedMate.name)

  function openConversation(mate: Mate) {
    setSelectedMate(mate)
    setView('Chat')
    setStatus('')
  }

  function focusComposer() {
    openConversation(selectedMate)
    requestAnimationFrame(() => composer.current?.focus())
  }

  function updateShowDates(show: boolean) {
    try {
      localStorage.setItem(showDatesKey, String(show))
      setShowDates(show)
      return true
    } catch {
      return false
    }
  }

  function openActivity(mate = '') {
    setFilter(mate)
    setStatus('')
    setView('Activity')
  }

  function openEditor(next: Editor) {
    setStatus('')
    setEditor(next)
  }

  function saveDraft(text: string, mate: Mate, existing?: Draft) {
    const draft: Draft = {
      id: existing?.id ?? crypto.randomUUID(),
      mate: mate.name,
      text,
      updatedAt: Date.now(),
    }
    return updateDrafts(
      [draft, ...drafts.filter(({ id }) => id !== draft.id)],
      'Draft saved.',
    )
  }

  function updateDrafts(next: Draft[], message: string) {
    try {
      storeDrafts(next)
    } catch {
      return false
    }
    setDrafts(next)
    setStatus(message)
    return true
  }

  function deleteDraft(draft: Draft) {
    const next = drafts.filter(({ id }) => id !== draft.id)
    if (!updateDrafts(next, 'Draft deleted.')) return false
    if (next.length === 0) setFilter('')
    requestAnimationFrame(() => activityHeading.current?.focus())
    return true
  }

  async function copyDraft(draft: Draft) {
    try {
      await navigator.clipboard.writeText(draft.text)
      setStatus('Draft copied.')
    } catch {
      setStatus('Could not copy the draft.')
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={brand} alt="" width="34" height="34" />
          <span>Mates</span>
        </div>
        <div className="sidebar-conversations">
          <button
            type="button"
            className="secondary-button new-draft"
            onClick={focusComposer}
          >
            <span aria-hidden="true">+</span> New draft
          </button>
          <button
            ref={commandButton}
            type="button"
            className="secondary-button workspace-commands"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => setCommandsOpen(true)}
          >
            Commands <kbd aria-hidden="true">{commandShortcut}</kbd>
          </button>
          <nav className="mates-navigation" aria-label="Mates">
            <h2>Mates</h2>
            <ul className="mate-list">
              {team.map((mate) => (
                <li key={mate.name}>
                  <button
                    type="button"
                    className="mate-row"
                    aria-pressed={view === 'Chat' && selectedMate === mate}
                    onClick={() => openConversation(mate)}
                  >
                    <span className="avatar" data-color={mate.color}>
                      <img src={mate.image} alt="" width="30" height="30" />
                    </span>
                    <span className="mate-label">
                      <strong>{mate.name}</strong>
                      <span>{mate.role}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Workspace">
            <button type="button" aria-current={view === 'Activity' ? 'page' : undefined} onClick={() => openActivity()}>
              Activity
              {drafts.length > 0 && <span className="nav-count" aria-hidden="true">{drafts.length}</span>}
            </button>
          </nav>
        </div>
        <div className="workspace-status">
          <nav aria-label="Workspace preferences">
            <button type="button" onClick={() => setSettingsOpen(true)}>Settings</button>
            <button type="button" className="account-button" onClick={onOpenAccount}>Account</button>
          </nav>
          <span>Local workspace</span>
        </div>
      </aside>

      <main className="workspace">
        {view === 'Chat' ? (
          <Conversation
            key={selectedMate.name}
            mate={selectedMate}
            drafts={mateDrafts}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((open) => !open)}
            onViewActivity={() => openActivity(selectedMate.name)}
            text={composerText[selectedMate.name] ?? ''}
            composer={composer}
            onTextChange={(value) => setComposerText((current) => ({ ...current, [selectedMate.name]: value }))}
            onSave={(text) => saveDraft(text, selectedMate)}
            onEdit={(draft) => openEditor({ mate: selectedMate, draft })}
          />
        ) : (
          <section className="activity" aria-labelledby="activity-heading">
            <div className="activity-header">
              <div>
                <h1 id="activity-heading" ref={activityHeading} tabIndex={-1}>Activity</h1>
                <p className="subtitle">Request drafts saved on this device.</p>
              </div>
              {drafts.length > 0 && <MateFilter value={filter} onChange={setFilter} />}
            </div>
            {visibleDrafts.length === 0 ? (
              <div className="activity-empty">
                <h2>{filter ? `No drafts for ${filter}` : 'No drafts yet'}</h2>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => filter ? setFilter('') : openConversation(selectedMate)}
                >
                  {filter ? 'Show all drafts' : 'Choose a mate'}
                </button>
              </div>
            ) : (
              <ul className="draft-list">
                {visibleDrafts.map((draft) => {
                  const mate = team.find(({ name }) => name === draft.mate)
                  return (
                    <li key={draft.id}>
                      {mate && (
                        <span className="avatar" data-color={mate.color}>
                          <img src={mate.image} alt="" width="38" height="38" />
                        </span>
                      )}
                      <div className="draft-entry">
                        <h2>{draft.mate}</h2>
                        {showDates && (
                          <time dateTime={new Date(draft.updatedAt).toISOString()}>
                            {dateFormat.format(draft.updatedAt)}
                          </time>
                        )}
                        <p>{draft.text}</p>
                      </div>
                      <div className="draft-row-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={`Copy draft for ${draft.mate}`}
                          onClick={() => void copyDraft(draft)}
                        >
                          Copy
                        </button>
                        {mate && (
                          <button
                            className="secondary-button"
                            type="button"
                            aria-label={`Edit draft for ${draft.mate}`}
                            onClick={() => openEditor({ mate, draft })}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
        <div className="save-status" role="status">{status}</div>
      </main>
      {commandsOpen && (
        <CommandPalette
          onClose={() => setCommandsOpen(false)}
          commands={[
            { id: 'new', title: 'New draft', run: focusComposer },
            { id: 'details', title: 'Show mate details', description: selectedMate.name, run: () => {
              openConversation(selectedMate)
              setDetailsOpen(true)
            } },
            { id: 'activity', title: 'Open Activity', run: () => openActivity() },
            { id: 'settings', title: 'Open Settings', run: () => setSettingsOpen(true) },
            { id: 'account', title: 'Open Account', run: onOpenAccount },
            ...team.map((mate) => ({
              id: mate.name.toLowerCase(),
              title: `Open ${mate.name}`,
              description: mate.role,
              run: () => openConversation(mate),
            })),
          ]}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          starterMate={initialMate}
          showDates={showDates}
          onStarterChange={onStarterChange}
          onDatesChange={updateShowDates}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editor && (
        <DraftEditor editor={editor} onClose={() => setEditor(null)} onSave={(text) => saveDraft(text, editor.mate, editor.draft)} onDelete={deleteDraft} />
      )}
    </div>
  )
}

const starterMateKey = 'mates.starter-mate.v1'

function loadStarterMate() {
  try {
    const saved = localStorage.getItem(starterMateKey)
    return team.find((mate) => mate.name === saved) ?? null
  } catch {
    return null
  }
}

function App() {
  const [starterMate, setStarterMate] = useState(loadStarterMate)
  const [accountOpen, setAccountOpen] = useState(false)

  function updateStarterMate(mate: Mate) {
    try {
      localStorage.setItem(starterMateKey, mate.name)
      setStarterMate(mate)
      return true
    } catch {
      return false
    }
  }

  function startWorkspace(mate: Mate) {
    if (!updateStarterMate(mate)) setStarterMate(mate)
  }

  return (
    <>
      {starterMate && (
        <div hidden={accountOpen}>
          <Workspace
            initialMate={starterMate}
            onOpenAccount={() => setAccountOpen(true)}
            onStarterChange={updateStarterMate}
          />
        </div>
      )}
      {(!starterMate || accountOpen) && (
        <EntryFlow
          onStart={startWorkspace}
          onReturn={accountOpen ? () => setAccountOpen(false) : undefined}
        />
      )}
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root.')
createRoot(root).render(<App />)
