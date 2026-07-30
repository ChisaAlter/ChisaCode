import type { ComponentType } from "react";
import { withUnistyles } from "react-native-unistyles";

interface IconLeafProps {
  color: string;
  size: number;
  fill?: string;
  strokeWidth?: number;
}

/**
 * Host that injects theme-reactive `color` (and optional `fill`/`strokeWidth`)
 * into icon components without forwarding `uniProps` onto the leaf.
 *
 * On web, `withUnistyles` merges call-site props onto the wrapped child
 * (`deepMergeObjects(mappings, unistyleProps, props)`). Lucide icons then
 * spread unknown props onto the DOM SVG, which triggers:
 * "React does not recognize the `uniProps` prop on a DOM element".
 *
 * Route theme colors through this host so only known icon props reach the leaf.
 * Pass `uniProps` to the host, never to lucide/provider icon leaves.
 *
 * `IconLeafProps` keeps `color`/`size` required (the host always supplies them)
 * so provider icon components — which declare both as required — are assignable.
 * Lucide icons accept the same props as optional, so they are assignable too.
 */
export function ThemedIconColorHost({
  color,
  size,
  fill,
  strokeWidth,
  Icon,
}: {
  color: string;
  size: number;
  fill?: string;
  strokeWidth?: number;
  Icon: ComponentType<IconLeafProps>;
}) {
  return <Icon color={color} size={size} fill={fill} strokeWidth={strokeWidth} />;
}

export const ThemedIconHost = withUnistyles(ThemedIconColorHost);
