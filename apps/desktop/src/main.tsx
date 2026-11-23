import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import brand from '../../../brand/mates-avatar.png'
import scout from '../../web/public/mates/teardrop-sunset.png'
import pixel from '../../web/public/mates/squircle-purple.png'
import fern from '../../web/public/mates/pebble-teal.png'
import dot from '../../web/public/mates/cloud-blue.png'
import { loadDrafts, storeDrafts } from './drafts'
import type { Draft } from './drafts'
import './styles.css'

const team = [
  {
    name: 'Scout',
    role: 'Research',
    image: scout,
    color: 'peach',
    description: 'Find sources, compare options, and turn loose questions into clear briefs.',
    skills: ['Web research', 'Source checks', 'Briefs'],
    prompt: 'Compare the options for … and link to the sources you used.',
  },
  {
    name: 'Pixel',
    role: 'Engineering',
    image: pixel,
    color: 'lilac',
    description: 'Read through a codebase, work through bugs, and prepare changes for review.',
    skills: ['Code review', 'Debugging', 'Pull requests'],
    prompt: 'Review this change for regressions and suggest what to verify before merging.',
  },
  {
    name: 'Fern',
    role: 'Writing',
    image: fern,
    color: 'mint',
    description: 'Turn rough notes into drafts and edit them for the people who will read them.',
    skills: ['Drafts', 'Editing', 'Summaries'],
    prompt: 'Turn these notes into a short update I can share with the team.',
  },
  {
    name: 'Dot',
    role: 'Operations',
    image: dot,
    color: 'blue',
    description: 'Keep track of follow-ups and pull together the details before a meeting.',
    skills: ['Meeting prep', 'Follow-ups', 'Planning'],
    prompt: 'Turn my meeting notes into follow-ups with owners and due dates.',
  },
] as const

type Mate = (typeof team)[number]
const views = ['Team', 'Activity'] as const
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

function App() {
  const [view, setView] = useState<(typeof views)[number]>('Team')
  const [selectedMate, setSelectedMate] = useState<Mate>(team[0])
  const [drafts, setDrafts] = useState(loadDrafts)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const activityHeading = useRef<HTMLHeadingElement>(null)
  const visibleDrafts = filter ? drafts.filter((draft) => draft.mate === filter) : drafts
  const mateDraftCount = drafts.filter((draft) => draft.mate === selectedMate.name).length

  function openActivity(mate = '') {
    setFilter(mate)
    setStatus('')
    setView('Activity')
  }

  function openEditor(next: Editor) {
    setStatus('')
    setEditor(next)
  }

  function saveDraft(text: string) {
    if (!editor) return false
    const draft: Draft = {
      id: editor.draft?.id ?? crypto.randomUUID(),
      mate: editor.mate.name,
      text,
      updatedAt: Date.now(),
    }
    return updateDrafts(
      [draft, ...drafts.filter(({ id }) => id !== draft.id)],
      view === 'Team' ? 'Draft saved in Activity.' : 'Draft saved.',
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
        <nav aria-label="Workspace">
          {views.map((name) => (
            <button
              key={name}
              type="button"
              aria-current={view === name ? 'page' : undefined}
              onClick={() => {
                if (name === 'Activity') {
                  openActivity()
                  return
                }
                setStatus('')
                setView(name)
              }}
            >
              {name}
              {name === 'Activity' && drafts.length > 0 && (
                <span className="nav-count" aria-hidden="true">{drafts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="workspace-status">Local workspace</div>
      </aside>

      <main className="workspace">
        {view === 'Team' ? (
          <div className="team-layout">
            <section className="roster" aria-labelledby="team-heading">
              <h1 id="team-heading">Your team</h1>
              <p className="subtitle">Pick a mate to see what they can help with.</p>
              <ul className="mate-list">
                {team.map((mate) => (
                  <li key={mate.name}>
                    <button
                      type="button"
                      className="mate-row"
                      aria-pressed={selectedMate === mate}
                      onClick={() => setSelectedMate(mate)}
                    >
                      <span className="avatar" data-color={mate.color}>
                        <img src={mate.image} alt="" width="38" height="38" />
                      </span>
                      <span className="mate-label">
                        <strong>{mate.name}</strong>
                        <span>{mate.role}</span>
                      </span>
                      <span className="chevron" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mate-detail" aria-labelledby="mate-heading">
              <div className="portrait" data-color={selectedMate.color}>
                <img src={selectedMate.image} alt="" />
              </div>
              <div className="mate-bio">
                <p className="role">{selectedMate.role}</p>
                <h2 id="mate-heading">{selectedMate.name}</h2>
                <p className="description">{selectedMate.description}</p>
                <ul className="skills" aria-label="What this mate can help with">
                  {selectedMate.skills.map((skill) => <li key={skill}>{skill}</li>)}
                </ul>
                <div className="mate-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openEditor({ mate: selectedMate })}
                  >
                    Draft a request
                  </button>
                  {mateDraftCount > 0 && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openActivity(selectedMate.name)}
                    >
                      View drafts ({mateDraftCount})
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
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
                  onClick={() => filter ? setFilter('') : setView('Team')}
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
                        <time dateTime={new Date(draft.updatedAt).toISOString()}>
                          {dateFormat.format(draft.updatedAt)}
                        </time>
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
      {editor && (
        <DraftEditor editor={editor} onClose={() => setEditor(null)} onSave={saveDraft} onDelete={deleteDraft} />
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root.')
createRoot(root).render(<App />)
