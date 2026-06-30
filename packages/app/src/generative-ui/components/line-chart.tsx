import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { GenerativeUiComponentBaseProps } from "@/generative-ui/registry/types";

interface LineChartDataPoint {
  [key: string]: unknown;
}

interface LineChartProps extends GenerativeUiComponentBaseProps {
  props: {
    title?: string;
    xAxis: string;
    yAxis: string;
    data: LineChartDataPoint[];
    height?: number;
    color?: string;
  };
}

/**
 * Generative UI line chart component.
 * Renders a simplified line chart using react-native primitives.
 */
export default function LineChart({ instanceId, props, sendAction }: LineChartProps) {
  const height = props.height ?? 300;
  const data = useMemo(() => props.data ?? [], [props.data]);
  const xKey = props.xAxis;
  const yKey = props.yAxis;
  const color = props.color ?? "#3b82f6";

  const numericData = useMemo(
    () =>
      data.map((d) => {
        const val = d[yKey];
        return typeof val === "string" ? Number.parseFloat(val) : (val as number);
      }),
    [data, yKey],
  );

  const max = useMemo(
    () => Math.max(...numericData.filter((n) => !Number.isNaN(n)), 0),
    [numericData],
  );

  const points = useMemo(
    () =>
      numericData.map((v, i) => {
        const safeV = Number.isNaN(v) ? 0 : v;
        const pointY = max > 0 ? ((max - safeV) / max) * 100 : 50;
        return {
          x: (i / Math.max(data.length - 1, 1)) * 100,
          y: pointY,
        };
      }),
    [numericData, max, data.length],
  );

  const chartContainerStyle = useMemo(() => ({ height, position: "relative" as const }), [height]);

  const pointStyles = useMemo(
    () =>
      points.map((p) => ({
        ...dotBaseStyle,
        left: `${p.x}%` as const,
        top: `${p.y}%` as const,
        backgroundColor: color,
      })),
    [points, color],
  );

  const pointHandlers = useMemo(
    () =>
      points.map((_, i) => () => {
        void sendAction(instanceId, "point_click", {
          index: i,
          point: data[i],
        });
      }),
    [points, instanceId, data, sendAction],
  );

  const labelKeys = useMemo(
    () => data.map((d) => `${String(d[xKey] ?? "")}-${String(d[yKey] ?? "")}`),
    [data, xKey, yKey],
  );

  // All hooks must be called before any conditional return
  if (data.length === 0) {
    return (
      <View style={cardStyle}>
        {props.title ? <Text style={titleStyle}>{props.title}</Text> : null}
        <Text style={emptyStyle}>No data</Text>
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      {props.title ? <Text style={titleStyle}>{props.title}</Text> : null}
      <View style={chartContainerStyle}>
        <View style={chartAreaStyle}>
          {points.map((p, i) => (
            <TouchableOpacity
              key={`point-${p.x}-${p.y}`}
              style={pointStyles[i]}
              onPress={pointHandlers[i]}
            />
          ))}
          {/* connecting lines */}
          {points.length > 1 &&
            points
              .slice(1)
              .map((p) => <View key={`line-${p.x}-${p.y}`} style={lineSegmentStyle} />)}
        </View>
        {/* labels */}
        <View style={labelsRowStyle}>
          {data.map((d, i) => (
            <Text key={labelKeys[i]} style={labelTextStyle} numberOfLines={1}>
              {String(d[xKey] ?? "")}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const cardStyle = { padding: 12 } as const;
const titleStyle = { fontSize: 14, fontWeight: "600" as const, marginBottom: 8 } as const;
const emptyStyle = { color: "#888", fontSize: 12 } as const;
const chartAreaStyle = {
  flex: 1,
  position: "relative" as const,
  borderLeftWidth: 1,
  borderBottomWidth: 1,
  borderColor: "#e5e7eb",
} as const;
const dotBaseStyle = {
  position: "absolute" as const,
  width: 12,
  height: 12,
  borderRadius: 6,
  marginLeft: -6,
  marginTop: -6,
} as const;
const lineSegmentStyle = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;
const labelsRowStyle = {
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  paddingTop: 4,
} as const;
const labelTextStyle = { fontSize: 10, color: "#888" } as const;
