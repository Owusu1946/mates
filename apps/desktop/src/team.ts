import scout from '../../web/public/mates/teardrop-sunset.png'
import pixel from '../../web/public/mates/squircle-purple.png'
import fern from '../../web/public/mates/pebble-teal.png'
import dot from '../../web/public/mates/cloud-blue.png'

export const team = [
  {
    name: 'Scout',
    role: 'Research',
    image: scout,
    color: 'peach',
    description: 'Find sources, compare options, and turn loose questions into clear briefs.',
    prompt: 'Compare the options for … and link to the sources you used.',
  },
  {
    name: 'Pixel',
    role: 'Engineering',
    image: pixel,
    color: 'lilac',
    description: 'Read through a codebase, work through bugs, and prepare changes for review.',
    prompt: 'Review this change for regressions and suggest what to verify before merging.',
  },
  {
    name: 'Fern',
    role: 'Writing',
    image: fern,
    color: 'mint',
    description: 'Turn rough notes into drafts and edit them for the people who will read them.',
    prompt: 'Turn these notes into a short update I can share with the team.',
  },
  {
    name: 'Dot',
    role: 'Operations',
    image: dot,
    color: 'blue',
    description: 'Keep track of follow-ups and pull together the details before a meeting.',
    prompt: 'Turn my meeting notes into follow-ups with owners and due dates.',
  },
] as const

export type Mate = (typeof team)[number]
