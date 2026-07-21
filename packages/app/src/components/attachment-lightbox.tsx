import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { isWeb } from "@/constants/platform";

interface AttachmentLightboxProps {
  metadata: AttachmentMetadata | null;
  onClose: () => void;
}

export function AttachmentLightbox({ metadata, onClose }: AttachmentLightboxProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const url = useAttachmentPreviewUrl(metadata);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [metadata?.id]);

  useEffect(() => {
    if (!isWeb || !metadata) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [metadata, onClose]);

  const closeButtonStyle = useMemo(
    () => [
      styles.closeButton,
      {
        top: insets.top + theme.spacing[3],
        right: insets.right + theme.spacing[3],
      },
    ],
    [insets.top, insets.right, theme.spacing],
  );

  const handleImageError = useCallback(() => setErrored(true), []);
  const noopPress = useCallback(() => {}, []);
  const imageSource = useMemo(() => ({ uri: url ?? "" }), [url]);

  if (!metadata) {
    return null;
  }

  const hasError = errored || !url;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          testID="attachment-lightbox-backdrop"
          accessibilityRole="button"
          accessibilityLabel={t("files.dismissImage")}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.contentLayer}>
          <View style={styles.imageArea}>
            {hasError ? (
              <Text style={styles.errorText}>{t("errors.imageLoadFailed")}</Text>
            ) : (
              <Pressable onPress={noopPress} style={styles.imagePressable}>
                <ExpoImage
                  testID="attachment-lightbox-image"
                  source={imageSource}
                  contentFit="contain"
                  onError={handleImageError}
                  style={imageFillStyle}
                />
              </Pressable>
            )}
          </View>
          <Pressable
            testID="attachment-lightbox-close"
            accessibilityRole="button"
            accessibilityLabel={t("files.dismissImage")}
            hitSlop={8}
            onPress={onClose}
            style={closeButtonStyle}
          >
            <X size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const imageFillStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  // Soft media dimmer: ink-tinted, not pure black.
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(20, 23, 31, 0.88)",
  },
  contentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "box-none",
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
    pointerEvents: "box-none",
  },
  imagePressable: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: 960,
    maxHeight: 640,
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: 12.5,
    lineHeight: 16,
  },
  closeButton: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
}));
