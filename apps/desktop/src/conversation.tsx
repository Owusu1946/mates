import { mentionDraft, mentionMatesForChat } from '@expojet/api-contract/chat-mentions'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Draft } from './drafts'
import { team } from './team'
import type { Mate } from './team'
import './conversation.css'

const mentionableMates = team.map((mate) => ({ ...mate, id: mate.name }))

export function Conversation({ mate, drafts, text, composer, onTextChange, onSave, onEdit }: {
  mate: Mate
  drafts: Draft[]
  text: string
  composer: RefObject<HTMLTextAreaElement | null>
  onTextChange: (value: string) => void
  onSave: (value: string) => boolean
  onEdit: (draft: Draft) => void
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const mentions = useRef<HTMLDivElement>(null)
  const [mentionsDismissed, setMentionsDismissed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const query = text.match(/(?:^|\s)@([^\s@]*)$/)?.[1]
  const matches = query === undefined || mentionsDismissed ? [] : mentionMatesForChat({
    kind: 'mate',
    primaryMateId: mate.name,
    groupMembers: [],
    ownedMates: mentionableMates,
    query,
  })

  useEffect(() => {
    const list = scroll.current
    if (list) list.scrollTop = list.scrollHeight
  }, [mate, drafts.length])

  function save() {
    if (!text.trim()) return
    if (onSave(text.trim())) {
      onTextChange('')
      setSaveFailed(false)
    } else {
      setSaveFailed(true)
    }
  }

  return (
    <section className="conversation" aria-labelledby="mate-heading">
      <header className="conversation-header">
        <span className="avatar" data-color={mate.color}>
          <img src={mate.image} alt="" width="32" height="32" />
        </span>
        <div>
          <h1 id="mate-heading">{mate.name}</h1>
          <p>{mate.role}</p>
        </div>
      </header>
      <div className="conversation-scroll" ref={scroll}>
        <div className="conversation-content">
          {drafts.length === 0 ? (
            <div className="conversation-empty">
              <span className="avatar" data-color={mate.color}>
                <img src={mate.image} alt="" width="58" height="58" />
              </span>
              <h2>Ask {mate.name}</h2>
              <p>{mate.description}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if (!text.trim()) onTextChange(mate.prompt)
                  composer.current?.focus()
                }}
              >
                {text.trim() ? 'Return to draft' : 'Use an example'}
              </button>
            </div>
          ) : (
            <ol className="conversation-drafts" aria-label={`Saved drafts for ${mate.name}`}>
              {drafts.slice().reverse().map((draft) => (
                <li key={draft.id}>
                  <div className="conversation-draft-meta">
                    <span>Draft</span>
                    <button type="button" onClick={() => onEdit(draft)}>Edit</button>
                  </div>
                  <p>{draft.text}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <form className="conversation-composer" onSubmit={(event) => {
        event.preventDefault()
        save()
      }}>
        {matches.length > 0 && (
          <div
            ref={mentions}
            className="composer-mentions"
            role="group"
            aria-label="Mention a mate"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              setMentionsDismissed(true)
              composer.current?.focus()
            }}
          >
            {matches.map((item) => (
              <button key={item.id} type="button" onClick={() => {
                onTextChange(mentionDraft(text, item.name))
                composer.current?.focus()
              }}>
                <img src={item.image} alt="" width="22" height="22" />
                {item.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={composer}
          aria-label={`Draft a message for ${mate.name}`}
          placeholder={`Ask ${mate.name}, or @ another mate…`}
          rows={3}
          maxLength={4000}
          value={text}
          onChange={(event) => {
            setMentionsDismissed(false)
            onTextChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && matches.length > 0) setMentionsDismissed(true)
            if (event.key === 'ArrowDown' && matches.length > 0) {
              event.preventDefault()
              mentions.current?.querySelector('button')?.focus()
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              save()
            }
          }}
        />
        {saveFailed && <p className="save-error" role="alert">Could not save this draft on this device.</p>}
        <div className="composer-footer">
          <span>Local drafts</span>
          <button className="primary-button" type="submit" disabled={!text.trim()}>Save draft</button>
        </div>
      </form>
    </section>
  )
}
