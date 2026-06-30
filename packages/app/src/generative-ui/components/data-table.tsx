import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import type { GenerativeUiComponentBaseProps } from "@/generative-ui/registry/types";

interface ColumnDef {
  key: string;
  title: string;
  sortable?: boolean;
}

interface TableProps extends GenerativeUiComponentBaseProps {
  props: {
    title?: string;
    columns: ColumnDef[];
    rows: Array<Record<string, unknown>>;
    pageSize?: number;
  };
}

function getSortIndicator(sortKey: string | null, sortDir: string, colKey: string): string {
  if (sortKey !== colKey) return "";
  return sortDir === "asc" ? " △" : " ▽";
}

export default function DataTable({ instanceId, props, sendAction }: TableProps) {
  const pageSize = props.pageSize ?? 10;
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = useMemo(() => props.columns ?? [], [props.columns]);
  const rows = useMemo(() => props.rows ?? [], [props.rows]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const va = String(a[sortKey] ?? "");
      const vb = String(b[sortKey] ?? "");
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(
    () => sortedRows.slice(page * pageSize, (page + 1) * pageSize),
    [sortedRows, page, pageSize],
  );

  const handleSort = useCallback(
    (key: string) => {
      setSortKey((prevSortKey) => {
        setSortDir((prevSortDir) => {
          const newDir = prevSortKey === key && prevSortDir === "asc" ? "desc" : "asc";
          void sendAction(instanceId, "sort", { column: key, direction: newDir });
          return newDir;
        });
        return key;
      });
    },
    [instanceId, sendAction],
  );

  const headerHandlers = useMemo(
    () =>
      columns.map((col) => () => {
        handleSort(col.key);
      }),
    [columns, handleSort],
  );

  const rowHandlers = useMemo(
    () =>
      pageRows.map((row, rowIdx) => () => {
        void sendAction(instanceId, "row_click", {
          index: page * pageSize + rowIdx,
          row,
        });
      }),
    [pageRows, page, pageSize, instanceId, sendAction],
  );

  const rowKeys = useMemo(
    () =>
      pageRows.map(
        (row, i) => `row-${page}-${i}-${columns.map((c) => String(row[c.key] ?? "")).join(",")}`,
      ),
    [pageRows, page, columns],
  );

  const handlePrevPage = useCallback(() => {
    setPage((p) => p - 1);
  }, []);
  const handleNextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const prevTextStyle = useMemo(
    () => ({ color: page === 0 ? "#ccc" : "#3b82f6", fontSize: 12 }),
    [page],
  );
  const nextTextStyle = useMemo(
    () => ({ color: page >= totalPages - 1 ? "#ccc" : "#3b82f6", fontSize: 12 }),
    [page, totalPages],
  );

  return (
    <View style={containerStyle}>
      {props.title ? <Text style={titleTextStyle}>{props.title}</Text> : null}

      <ScrollView horizontal>
        <View>
          {/* Header */}
          <View style={headerRowStyle}>
            {columns.map((col, i) => (
              <TouchableOpacity
                key={col.key}
                style={cellBaseStyle}
                disabled={!col.sortable}
                onPress={headerHandlers[i]}
              >
                <Text style={headerTextStyle}>
                  {col.title}
                  {getSortIndicator(sortKey, sortDir, col.key)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Rows */}
          {pageRows.map((row, rowIdx) => (
            <TouchableOpacity
              key={rowKeys[rowIdx]}
              style={dataRowStyle}
              onPress={rowHandlers[rowIdx]}
            >
              {columns.map((col) => (
                <View key={col.key} style={cellBaseStyle}>
                  <Text style={rowTextStyle} numberOfLines={1}>
                    {String(row[col.key] ?? "")}
                  </Text>
                </View>
              ))}
            </TouchableOpacity>
          ))}

          {pageRows.length === 0 ? (
            <View style={emptyContainerStyle}>
              <Text style={emptyTextStyle}>No data</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Pagination */}
      {totalPages > 1 ? (
        <View style={paginationRowStyle}>
          <TouchableOpacity disabled={page === 0} onPress={handlePrevPage}>
            <Text style={prevTextStyle}>Prev</Text>
          </TouchableOpacity>
          <Text style={pageCountStyle}>
            {page + 1} / {totalPages}
          </Text>
          <TouchableOpacity disabled={page >= totalPages - 1} onPress={handleNextPage}>
            <Text style={nextTextStyle}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const containerStyle = { padding: 12 } as const;
const titleTextStyle = { fontSize: 14, fontWeight: "600" as const, marginBottom: 8 } as const;
const headerRowStyle = {
  flexDirection: "row" as const,
  borderBottomWidth: 1,
  borderBottomColor: "#e5e7eb",
} as const;
const headerTextStyle = { fontSize: 12, fontWeight: "600" as const, color: "#374151" } as const;
const cellBaseStyle = { padding: 8, minWidth: 100 } as const;
const dataRowStyle = {
  flexDirection: "row" as const,
  borderBottomWidth: 1,
  borderBottomColor: "#f3f4f6",
} as const;
const rowTextStyle = { fontSize: 12, color: "#111" } as const;
const emptyContainerStyle = { padding: 16 } as const;
const emptyTextStyle = { color: "#888", fontSize: 12, textAlign: "center" as const } as const;
const paginationRowStyle = {
  flexDirection: "row" as const,
  justifyContent: "center" as const,
  marginTop: 8,
  gap: 8,
} as const;
const pageCountStyle = { fontSize: 12, color: "#666" } as const;
