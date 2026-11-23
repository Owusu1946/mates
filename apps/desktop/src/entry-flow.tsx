import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import brand from '../../../brand/mates-avatar.png'
import { team } from './team'
import type { Mate } from './team'
import './entry-flow.css'

type AuthMode = 'sign-in' | 'create'
type Step = 'welcome' | 'pick' | AuthMode | 'verify'

function MateArtwork({ mate }: { mate: Mate | null }) {
  return (
    <div className="entry-art" aria-hidden="true" data-color={mate?.color}>
      {mate ? (
        <img className="entry-portrait" src={mate.image} alt="" />
      ) : (
        <div className="entry-mascots">
          {[team[2], team[0], team[1]].map((item) => (
            <img key={item.name} src={item.image} alt="" data-mate={item.name} />
          ))}
        </div>
      )}
    </div>
  )
}

export function EntryFlow({ onStart, onReturn }: {
  onStart: (mate: Mate) => void
  onReturn?: () => void
}) {
  const [step, setStep] = useState<Step>(onReturn ? 'sign-in' : 'welcome')
  const [mate, setMate] = useState<Mate>(team[0])
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  function openAuth(mode: AuthMode) {
    setAuthMode(mode)
    setStep(mode)
  }

  function previewVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStep('verify')
  }

  return (
    <main className="entry" aria-labelledby="entry-heading">
      <section className="entry-content">
        <div className="entry-brand">
          <img src={brand} alt="" width="36" height="36" />
          <span>Mates</span>
        </div>

        <div className="entry-body">
          {step === 'welcome' && (
            <>
              <h1 id="entry-heading" ref={heading} tabIndex={-1}>Meet your Mates.</h1>
              <p className="entry-description">Pick a mate for research, writing, code, or the work that keeps everything on track.</p>
              <div className="entry-actions">
                <button className="primary-button" type="button" onClick={() => setStep('pick')}>
                  Set up a local workspace
                </button>
                <button className="secondary-button" type="button" onClick={() => openAuth('sign-in')}>
                  Account preview
                </button>
              </div>
            </>
          )}

          {step === 'pick' && (
            <>
              <h1 id="entry-heading" ref={heading} tabIndex={-1}>Pick your first mate.</h1>
              <p className="entry-description">They’ll be selected when you open your workspace. The whole team will be there.</p>
              <div className="starter-grid" role="group" aria-label="First mate">
                {team.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="starter-option"
                    aria-pressed={mate === item}
                    onClick={() => setMate(item)}
                  >
                    <span className="avatar" data-color={item.color}>
                      <img src={item.image} alt="" width="32" height="32" />
                    </span>
                    <span className="starter-label">
                      <strong>{item.name}</strong>
                      <small>{item.role}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="entry-actions">
                <button className="primary-button" type="button" onClick={() => onStart(mate)}>
                  Open workspace
                </button>
                <button className="secondary-button" type="button" onClick={() => setStep('welcome')}>
                  Back
                </button>
              </div>
            </>
          )}

          {(step === 'sign-in' || step === 'create') && (
            <>
              <h1 id="entry-heading" ref={heading} tabIndex={-1}>
                {step === 'sign-in' ? 'Sign in to Mates.' : 'Create an account.'}
              </h1>
              <p className="entry-description">Account preview. You can try the email flow without sending or saving an address.</p>
              <form className="auth-form" autoComplete="off" onSubmit={previewVerification}>
                <label htmlFor="entry-email">Email address</label>
                <input id="entry-email" type="email" placeholder="you@example.com" required />
                <button className="primary-button" type="submit">Preview verification</button>
              </form>
              <div className="entry-actions">
                <button
                  className="entry-link"
                  type="button"
                  onClick={() => openAuth(step === 'sign-in' ? 'create' : 'sign-in')}
                >
                  {step === 'sign-in' ? 'Create an account' : 'Sign in instead'}
                </button>
                <button className="entry-link" type="button" onClick={onReturn ?? (() => setStep('pick'))}>
                  {onReturn ? 'Back to workspace' : 'Continue locally'}
                </button>
              </div>
            </>
          )}

          {step === 'verify' && (
            <>
              <h1 id="entry-heading" ref={heading} tabIndex={-1}>Check your email.</h1>
              <p className="entry-description">This is the verification preview. Desktop accounts are still in development, so Mates hasn’t sent a code.</p>
              <div className="entry-actions">
                <button className="primary-button" type="button" onClick={onReturn ?? (() => setStep('pick'))}>
                  {onReturn ? 'Back to workspace' : 'Continue locally'}
                </button>
                <button className="secondary-button" type="button" onClick={() => setStep(authMode)}>
                  {authMode === 'sign-in' ? 'Back to sign in' : 'Back to account setup'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
      <MateArtwork mate={step === 'pick' ? mate : null} />
    </main>
  )
}
