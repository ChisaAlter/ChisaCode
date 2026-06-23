export interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  groupId: string;
  index: number;
  sizes: number[];
  onResizeSplit: (groupId: string, sizes: number[]) => void;
}
