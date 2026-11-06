import React, { useEffect, useRef, useState } from "react";
import { View, LayoutChangeEvent } from "react-native";
import Svg, { Line } from "react-native-svg";
import { useReducedMotion } from "react-native-reanimated";

interface VoiceWaveVisualizerProps {
  isActive: boolean;
  audioLevel?: number; // 0 to 1
  color: string;
  height?: number;
}

interface BarData {
  x: number;
  height: number;
  opacity: number;
}

export function VoiceWaveVisualizer({
  isActive,
  audioLevel = 0.25,
  color,
  height = 36,
}: VoiceWaveVisualizerProps) {
  const reducedMotion = useReducedMotion();
  const [layoutWidth, setLayoutWidth] = useState(200);
  const [bars, setBars] = useState<BarData[]>([]);

  const animRef = useRef({
    phase: 0,
    smoothedEnergy: 0.15,
    targetEnergy: audioLevel,
    lastTime: performance.now(),
    frameId: 0,
  });

  useEffect(() => {
    animRef.current.targetEnergy = Math.max(0.05, Math.min(1, audioLevel));
  }, [audioLevel]);

  const onLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w > 20 && Math.abs(w - layoutWidth) > 4) {
      setLayoutWidth(w);
    }
  };

  useEffect(() => {
    // Determine bar count to fill width with ~6.5px pitch (3.5px bar + 3px gap)
    const barPitch = 6.8;
    const numBars = Math.max(16, Math.min(36, Math.floor(layoutWidth / barPitch)));
    const actualPitch = layoutWidth / numBars;

    if (!isActive || reducedMotion) {
      // Idle state: small dots with subtle edge feathering
      const idleBars: BarData[] = [];
      for (let i = 0; i < numBars; i++) {
        const u = i / (numBars - 1);
        const x = (i + 0.5) * actualPitch;
        const feather = Math.min(1, Math.sin(Math.PI * u) * 1.5);
        idleBars.push({
          x,
          height: 0, // line length 0 with round cap renders a dot
          opacity: Math.max(0.2, feather * 0.7),
        });
      }
      setBars(idleBars);
      return;
    }

    let isMounted = true;
    animRef.current.lastTime = performance.now();

    const loop = (now: number) => {
      if (!isMounted) return;
      const state = animRef.current;
      const dt = Math.min((now - state.lastTime) / 1000, 0.05);
      state.lastTime = now;

      // Smoothly follow audio energy
      state.smoothedEnergy += (state.targetEnergy - state.smoothedEnergy) * Math.min(1, dt * 10);

      // Phase progression
      state.phase += dt * (4.0 + state.smoothedEnergy * 4.0);

      const nextBars: BarData[] = [];
      const maxHeight = Math.max(8, height - 10);
      const minHeight = 0; // 0 length + round linecap = circular dot

      for (let i = 0; i < numBars; i++) {
        const u = i / (numBars - 1);
        const x = (i + 0.5) * actualPitch;

        // Edge feathering: outer 3-4 bars fade down in opacity (matching ChatGPT reference)
        const feather = Math.min(1, Math.sin(Math.PI * u) * 1.45);
        const opacity = Math.max(0.18, feather * 0.95);

        // Wave harmonics creating dynamic audio peaks across the bars
        const wave1 = Math.sin(u * Math.PI * 3.2 - state.phase);
        const wave2 = Math.sin(u * Math.PI * 5.6 + state.phase * 0.8);
        const envelope = Math.pow(Math.sin(Math.PI * u), 0.85);

        // Combined audio activity
        const rawAmp = Math.max(0, wave1 * 0.6 + wave2 * 0.4);
        const energyBoost = state.smoothedEnergy;
        const barHeight = minHeight + (maxHeight - minHeight) * rawAmp * energyBoost * envelope;

        nextBars.push({
          x,
          height: Math.max(0, barHeight),
          opacity,
        });
      }

      setBars(nextBars);
      state.frameId = requestAnimationFrame(loop);
    };

    animRef.current.frameId = requestAnimationFrame(loop);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animRef.current.frameId);
    };
  }, [isActive, layoutWidth, height, reducedMotion]);

  const centerY = height / 2;

  return (
    <View
      onLayout={onLayout}
      style={{
        flex: 1,
        height,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {layoutWidth > 0 && bars.length > 0 ? (
        <Svg width={layoutWidth} height={height} viewBox={`0 0 ${layoutWidth} ${height}`}>
          {bars.map((bar, index) => {
            const halfH = bar.height / 2;
            return (
              <Line
                key={index}
                x1={bar.x}
                y1={centerY - halfH}
                x2={bar.x}
                y2={centerY + halfH}
                stroke={color}
                strokeWidth={3.4}
                strokeLinecap="round"
                opacity={bar.opacity}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
