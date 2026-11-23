import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import brand from '../../../brand/mates-avatar.png'
import scout from '../../web/public/mates/teardrop-sunset.png'
import pixel from '../../web/public/mates/squircle-purple.png'
import fern from '../../web/public/mates/pebble-teal.png'
import dot from '../../web/public/mates/cloud-blue.png'
import './styles.css'

const team = [
  {
    name: 'Scout',
    role: 'Research',
    image: scout,
    color: 'peach',
    description: 'Find sources, compare options, and turn loose questions into clear briefs.',
    skills: ['Web research', 'Source checks', 'Briefs'],
  },
  {
    name: 'Pixel',
    role: 'Engineering',
    image: pixel,
    color: 'lilac',
    description: 'Read through a codebase, work through bugs, and prepare changes for review.',
    skills: ['Code review', 'Debugging', 'Pull requests'],
  },
  {
    name: 'Fern',
    role: 'Writing',
    image: fern,
    color: 'mint',
    description: 'Turn rough notes into drafts and edit them for the people who will read them.',
    skills: ['Drafts', 'Editing', 'Summaries'],
  },
  {
    name: 'Dot',
    role: 'Operations',
    image: dot,
    color: 'blue',
    description: 'Keep track of follow-ups and pull together the details before a meeting.',
    skills: ['Meeting prep', 'Follow-ups', 'Planning'],
  },
] as const

const views = ['Team', 'Activity'] as const

function App() {
  const [view, setView] = useState<(typeof views)[number]>('Team')
  const [selectedMate, setSelectedMate] = useState<(typeof team)[number]>(team[0])

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
              onClick={() => setView(name)}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="workspace-status">Sample workspace</div>
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

            <section className="mate-detail" aria-labelledby="mate-heading" aria-live="polite">
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
              </div>
            </section>
          </div>
        ) : (
          <section className="activity" aria-labelledby="activity-heading">
            <h1 id="activity-heading">Activity</h1>
            <p className="subtitle">This sample workspace has no activity yet.</p>
          </section>
        )}
      </main>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root.')
createRoot(root).render(<App />)
