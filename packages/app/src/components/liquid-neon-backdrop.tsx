import { useEffect, useMemo } from "react";
import { StyleSheet as RNStyleSheet, View } from "react-native";
import {
  createAnimatedComponent,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { StyleSheet } from "react-native-unistyles";

const AnimatedSvg = createAnimatedComponent(Svg);

export function LiquidNeonBackdrop() {
  const driftA = useSharedValue(0);
  const driftB = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    driftA.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    driftB.value = withRepeat(
      withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [driftA, driftB, pulse]);

  const bandAStyle = useAnimatedStyle(() => ({
    opacity: 0.42 + pulse.value * 0.14,
    transform: [
      { translateX: -64 + driftA.value * 112 },
      { translateY: -18 + driftA.value * 32 },
      { scale: 1.02 + pulse.value * 0.04 },
    ],
  }));
  const bandBStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + pulse.value * 0.12,
    transform: [
      { translateX: 72 - driftB.value * 128 },
      { translateY: 42 - driftB.value * 46 },
      { scale: 1.04 - pulse.value * 0.03 },
    ],
  }));
  const bandACombinedStyle = useMemo(() => [staticStyles.band, bandAStyle], [bandAStyle]);
  const bandBCombinedStyle = useMemo(
    () => [staticStyles.band, staticStyles.bandB, bandBStyle],
    [bandBStyle],
  );

  return (
    <View pointerEvents="none" style={styles.root}>
      <AnimatedSvg
        height="125%"
        preserveAspectRatio="none"
        style={bandACombinedStyle}
        viewBox="0 0 1200 760"
        width="125%"
      >
        <Defs>
          <LinearGradient id="liquidNeonA" x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <Stop offset="42%" stopColor="#22d3ee" stopOpacity="0.52" />
            <Stop offset="72%" stopColor="#d946ef" stopOpacity="0.36" />
            <Stop offset="100%" stopColor="#d946ef" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path
          d="M-80 420 C 140 250, 280 620, 520 430 S 920 260, 1280 390 L 1280 610 C 940 470, 760 650, 520 560 S 120 520, -80 690 Z"
          fill="url(#liquidNeonA)"
        />
      </AnimatedSvg>
      <AnimatedSvg
        height="120%"
        preserveAspectRatio="none"
        style={bandBCombinedStyle}
        viewBox="0 0 1200 760"
        width="120%"
      >
        <Defs>
          <LinearGradient id="liquidNeonB" x1="100%" x2="0%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#f0abfc" stopOpacity="0" />
            <Stop offset="34%" stopColor="#f0abfc" stopOpacity="0.28" />
            <Stop offset="64%" stopColor="#38bdf8" stopOpacity="0.42" />
            <Stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path
          d="M-60 140 C 200 30, 360 280, 610 170 S 930 60, 1260 170 L 1260 320 C 940 250, 760 380, 540 300 S 160 220, -60 350 Z"
          fill="url(#liquidNeonB)"
        />
      </AnimatedSvg>
      <View style={styles.noiseVeil} />
    </View>
  );
}

const staticStyles = RNStyleSheet.create({
  band: {
    position: "absolute",
    top: -120,
    left: -120,
  },
  bandB: {
    top: 120,
    left: 40,
  },
});

const styles = StyleSheet.create((theme) => ({
  root: {
    ...RNStyleSheet.absoluteFillObject,
    display: theme.glass.enabled ? "flex" : "none",
    backgroundColor: "#050914",
    overflow: "hidden",
  },
  noiseVeil: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 14, 0.52)",
  },
}));
