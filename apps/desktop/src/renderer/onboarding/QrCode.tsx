import { SHAPES } from "@muse-clone/mascot";

const CELLS = 29;

/**
 * The sign-in code the phone scans. For now it's drawn from the request's id so each one looks
 * different; the real one encodes mates://signin/<id> once the API's desktop-signin routes exist.
 */
function cellsFor(seed: string) {
  let state = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const random = () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 4294967296;
  };
  let path = "";
  for (let y = 0; y < CELLS; y++) {
    for (let x = 0; x < CELLS; x++) {
      const finder = (x < 8 && y < 8) || (x > CELLS - 9 && y < 8) || (x < 8 && y > CELLS - 9);
      const centre = x > 10 && x < 18 && y > 10 && y < 18;
      if (!finder && !centre && random() > 0.52) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return path;
}

const FINDERS = "M0 0h7v7h-7zM1 1v5h5v-5zM2 2h3v3h-3zM22 0h7v7h-7zM23 1v5h5v-5zM24 2h3v3h-3zM0 22h7v7h-7zM1 23v5h5v-5zM2 24h3v3h-3z";

export function QrCode({ seed, size = 176 }: { seed: string; size?: number }) {
  return (
    <svg className="flex-none rounded-2xl bg-white p-3 text-[#151714] shadow-[0_1px_2px_rgb(0_0_0/6%),0_8px_24px_rgb(0_0_0/8%)]" width={size} height={size} viewBox={`0 0 ${CELLS} ${CELLS}`} role="img" aria-label="Sign-in code for your phone" shapeRendering="crispEdges">
      <path d={cellsFor(seed)} fill="currentColor" />
      <path d={FINDERS} fill="currentColor" fillRule="evenodd" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.4" fill="#ffffff" />
      <g transform="translate(12.2 12.2) scale(0.023)">
        <path d={SHAPES.hexagon.body.match(/d="([^"]+)"/)?.[1] ?? ""} className="fill-brand" />
      </g>
    </svg>
  );
}
