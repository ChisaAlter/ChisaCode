import { MAX_CONTENT_WIDTH } from "@/constants/layout";

export function getTurnFooterStreamItemWrapperStyle(paddingHorizontal: number) {
  return {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "flex-start",
    paddingHorizontal,
  } as const;
}
