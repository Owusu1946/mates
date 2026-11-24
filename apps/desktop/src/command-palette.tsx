import { useEffect, useRef, useState } from 'react'
import './command-palette.css'

export type WorkspaceCommand = {
  id: string
  title: string
  description?: string
  run: () => void
}

export function CommandPalette({ commands, onClose }: {
  commands: WorkspaceCommand[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const terms = query.trim().toLowerCase().split(/\s+/)
  const results = commands.filter(({ title, description }) =>
    terms.every((term) => `${title} ${description ?? ''}`.toLowerCase().includes(term)),
  )
  const selected = results[active]

  useEffect(() => {
    dialog.current?.showModal()
    input.current?.focus()
  }, [])

  function execute(command: WorkspaceCommand) {
    dialog.current?.close()
    command.run()
  }

  return (
    <dialog
      ref={dialog}
      className="command-palette"
      aria-label="Workspace commands"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      <form onSubmit={(event) => {
        event.preventDefault()
        if (selected) execute(selected)
      }}>
        <input
          ref={input}
          role="combobox"
          aria-label="Find a workspace command"
          aria-controls="workspace-command-results"
          aria-expanded={results.length > 0}
          aria-activedescendant={selected ? `workspace-command-${selected.id}` : undefined}
          placeholder="Find a workspace command"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            if (!results.length) return
            const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
            setActive(next)
            document.getElementById(`workspace-command-${results[next].id}`)?.scrollIntoView({ block: 'nearest' })
          }}
        />
        <div className="command-results" id="workspace-command-results" role="listbox" aria-label="Commands">
          {results.map((command, index) => (
            <div
              key={command.id}
              id={`workspace-command-${command.id}`}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => setActive(index)}
              onClick={() => execute(command)}
            >
              <span>{command.title}</span>
              {command.description && <small>{command.description}</small>}
            </div>
          ))}
        </div>
        {results.length === 0 && <p className="command-empty" role="status">No matching commands.</p>}
        <footer><kbd>↑</kbd><kbd>↓</kbd> Move <kbd>Enter</kbd> Open <kbd>Esc</kbd> Close</footer>
      </form>
    </dialog>
  )
}
