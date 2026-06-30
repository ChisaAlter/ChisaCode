import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { GenerativeUiComponentBaseProps } from "@/generative-ui/registry/types";

interface BarChartDataPoint {
  [key: string]: unknown;
}

interface BarChartProps extends GenerativeUiComponentBaseProps {
  props: {
    title?: string;
    label: string;
    value: string;
    data: BarChartDataPoint[];
    height?: number;
  };
}

export default function BarChart({ instanceId, props, sendAction }: BarChartProps) {
  const height = props.height ?? 280;
  const data = useMemo(() => props.data ?? [], [props.data]);
  const labelKey = props.label;
  const valueKey = props.value;

  const numericData = useMemo(
    () =>
      data.map((d) => {
        const val = d[valueKey];
        return typeof val === "string" ? Number.parseFloat(val) : (val as number);
      }),
    [data, valueKey],
  );

  const max = useMemo(
    () => Math.max(...numericData.filter((n) => !Number.isNaN(n)), 0),
    [numericData],
  );

  const barContainerStyle = useMemo(
    () => ({
      height,
      flexDirection: "row" as const,
      alignItems: "flex-end" as const,
      gap: 8,
    }),
    [height],
  );

  const barStyles = useMemo(
    () =>
      numericData.map((val) => {
        const safeVal = Number.isNaN(val) ? 0 : val;
        const barH = max > 0 ? (safeVal / max) * (height - 30) : 0;
        return { ...barBaseStyle, height: barH };
      }),
    [numericData, max, height],
  );

  const barHandlers = useMemo(
    () =>
      data.map((d, i) => () => {
        void sendAction(instanceId, "bar_click", {
          index: i,
          category: d,
        });
      }),
    [data, instanceId, sendAction],
  );

  const barKeys = useMemo(
    () => data.map((d) => `${String(d[labelKey] ?? "")}-${String(d[valueKey] ?? "")}`),
    [data, labelKey, valueKey],
  );

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
      <View style={barContainerStyle}>
        {data.map((d, i) => {
          const val = numericData[i];
          return (
            <View key={barKeys[i]} style={barItemStyle}>
              <Text style={barValueStyle}>{String(val ?? "")}</Text>
              <TouchableOpacity style={barStyles[i]} onPress={barHandlers[i]} />
              <Text style={barLabelStyle} numberOfLines={1}>
                {String(d[labelKey] ?? "")}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const cardStyle = { padding: 12 } as const;
const titleStyle = { fontSize: 14, fontWeight: "600" as const, marginBottom: 8 } as const;
const emptyStyle = { color: "#888", fontSize: 12 } as const;
const barValueStyle = { fontSize: 10, color: "#666", marginBottom: 2 } as const;
const barLabelStyle = {
  fontSize: 9,
  color: "#888",
  marginTop: 2,
  textAlign: "center" as const,
} as const;
const barItemStyle = { flex: 1, alignItems: "center" as const } as const;
const barBaseStyle = {
  width: "100%" as const,
  backgroundColor: "#3b82f6",
  borderRadius: 4,
  minHeight: 2,
} as const;
