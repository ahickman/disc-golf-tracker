// The throw plot (DGT-PLT-001..006): tee at the bottom, centre line straight up, this session's throws as dots and,
// optionally, earlier throws in a paler colour. Tap a dot for its details.

import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { gridLines, plotFrame, toScreen } from '../core/plot.ts';
import { DEFAULT_CORRIDOR_M } from '../core/stats.ts';
import type { DistanceUnit } from '../core/units.ts';
import { colours, styles } from './ui.tsx';

export interface PlotThrow {
  key: string;
  downrangeM: number;
  crossRangeM: number;
  /** Shown when the dot is tapped. */
  label: string;
}

const PAST = '#9aa3ad';
const LATEST = '#e8590c';

export function ThrowPlot(props: {
  current: readonly PlotThrow[];
  past?: readonly PlotThrow[];
  unit: DistanceUnit;
  height?: number;
}) {
  const { current, past = [], unit, height = 320 } = props;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const all = [...past, ...current];
  const frame = plotFrame(all, width, height);
  const latest = current.length > 0 ? current[current.length - 1].key : null;
  const label = all.find((t) => t.key === selected)?.label;
  const corridorPx = DEFAULT_CORRIDOR_M * frame.scale;

  return (
    <View>
      <View
        style={{ height, borderWidth: 1, borderColor: colours.border, borderRadius: 10, overflow: 'hidden' }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} fill="#fbfbfb" onPress={() => setSelected(null)} />
            {/* corridor of ±20 ft around the centre line (DGT-RPT-002) */}
            <Rect
              x={frame.teeX - corridorPx}
              y={0}
              width={2 * corridorPx}
              height={frame.teeY}
              fill="#e8f0fe"
            />
            {gridLines(frame.maxDownrangeM, unit).map((g) => {
              const y = frame.teeY - g.metres * frame.scale;
              return (
                <Line key={g.label} x1={0} x2={width} y1={y} y2={y} stroke={colours.border} strokeWidth={1} />
              );
            })}
            {gridLines(frame.maxDownrangeM, unit).map((g) => (
              <SvgText
                key={`l${g.label}`}
                x={6}
                y={frame.teeY - g.metres * frame.scale - 4}
                fontSize={13}
                fill={colours.muted}
              >
                {`${g.label} ${unit}`}
              </SvgText>
            ))}
            <Line
              x1={frame.teeX}
              x2={frame.teeX}
              y1={frame.teeY}
              y2={0}
              stroke={colours.primary}
              strokeWidth={2}
              strokeDasharray="8 6"
            />
            <Polygon
              points={`${frame.teeX},${frame.teeY - 9} ${frame.teeX - 9},${frame.teeY + 7} ${frame.teeX + 9},${frame.teeY + 7}`}
              fill={colours.text}
            />
            {past.map((t) => {
              const p = toScreen(frame, t);
              return (
                <Circle key={t.key} cx={p.x} cy={p.y} r={5} fill={PAST} onPress={() => setSelected(t.key)} />
              );
            })}
            {current.map((t) => {
              const p = toScreen(frame, t);
              const isLatest = t.key === latest;
              return (
                <Circle
                  key={t.key}
                  cx={p.x}
                  cy={p.y}
                  r={isLatest ? 9 : 7}
                  fill={isLatest ? LATEST : colours.primary}
                  stroke={t.key === selected ? colours.text : '#ffffff'}
                  strokeWidth={t.key === selected ? 3 : 2}
                  onPress={() => setSelected(t.key)}
                />
              );
            })}
          </Svg>
        )}
      </View>
      <Text style={[styles.muted, { marginTop: 6, minHeight: 22 }]}>
        {label ?? (current.length + past.length > 0 ? 'Tap a dot for details.' : 'Throws will appear here.')}
      </Text>
    </View>
  );
}
