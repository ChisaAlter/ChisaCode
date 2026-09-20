import { useCallback, useEffect, useMemo, useState } from "react";
import { Image } from "react-native";
import { Globe2 } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";

import type { Theme } from "@/styles/theme";

const ThemedGlobe2 = withUnistyles(Globe2);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * Site favicon for the browser chrome: renders the webview-reported
 * `faviconUrl` and falls back to the muted globe icon when the URL is missing
 * or the image fails to load.
 */
export function BrowserFaviconIcon({
  faviconUrl,
  size = 14,
}: {
  faviconUrl: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  const source = useMemo(() => (faviconUrl ? { uri: faviconUrl } : null), [faviconUrl]);
  const imageStyle = useMemo(() => ({ width: size, height: size, borderRadius: 2 }), [size]);
  const handleError = useCallback(() => setFailed(true), []);

  if (!source || failed) {
    return <ThemedGlobe2 size={size} uniProps={mutedColorMapping} />;
  }

  return (
    <Image
      testID="browser-favicon"
      source={source}
      style={imageStyle}
      resizeMode="contain"
      onError={handleError}
    />
  );
}
