import { useState } from "react";
import Mascot from "./Mascot";

/** Hero face: still until you hover, then it lights up. */
export default function HeroMascot({ size }: { size: number }) {
  const [live, setLive] = useState(false);
  return (
    <span
      className="hero-mascot"
      onPointerEnter={() => setLive(true)}
      onPointerLeave={() => setLive(false)}
    >
      <Mascot size={size} state={live ? "excited" : "happy"} />
    </span>
  );
}
