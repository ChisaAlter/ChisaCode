import { useMemo } from "react";
import {
  Image,
  type ImageStyle,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { deriveProjectIconColor } from "@/utils/project-icon-color";

export function ProjectIconView({
  iconDataUri,
  initial,
  projectKey,
  imageStyle,
  fallbackStyle,
  textStyle,
}: {
  iconDataUri: string | null;
  initial: string;
  projectKey: string;
  imageStyle: StyleProp<ImageStyle>;
  fallbackStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
}) {
  const { theme } = useUnistyles();
  const imageSource = useMemo(() => ({ uri: iconDataUri ?? "" }), [iconDataUri]);
  const fallbackStyles = useMemo(
    () => [fallbackStyle, { backgroundColor: deriveProjectIconColor(projectKey) }],
    [fallbackStyle, projectKey],
  );
  const textStyles = useMemo(
    () => [textStyle, { color: theme.colors.accentForeground }],
    [textStyle, theme.colors.accentForeground],
  );

  if (iconDataUri) {
    return <Image source={imageSource} style={imageStyle} />;
  }
  return (
    <View style={fallbackStyles}>
      <Text style={textStyles}>{initial}</Text>
    </View>
  );
}
