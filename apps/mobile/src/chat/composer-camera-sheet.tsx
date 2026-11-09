import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Host, BottomSheet, RNHostView } from "@expo/ui";
import { CameraView, CameraType, FlashMode, useCameraPermissions } from "expo-camera";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ChatIcon } from "./chat-icon";

// The camera runs edge to edge: on iOS the sheet content otherwise stops above the home
// indicator, leaving a bare strip. The SwiftUI modifiers module loads native code, so iOS only.
const sheetModifiers =
  Platform.OS === "ios"
    ? [require("@expo/ui/swift-ui/modifiers").ignoreSafeArea({ regions: "container", edges: "bottom" })]
    : undefined;

interface ComposerCameraSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photo: { uri: string; width: number; height: number }) => void;
  colors: {
    foreground: string;
    background: string;
    muted: string;
    mutedForeground: string;
    border: string;
    primary: string;
    primaryForeground: string;
  };
}

export function ComposerCameraSheet({
  isOpen,
  onClose,
  onCapture,
  colors,
}: ComposerCameraSheetProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);

  const handleCapture = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}

    setIsShutterFlashing(true);
    let captured: { uri: string; width: number; height: number } | null = null;

    try {
      // Full quality here: the composer downscales once, so re-encoding twice would blur text.
      const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (photo?.uri) captured = { uri: photo.uri, width: photo.width, height: photo.height };
    } catch (err) {
      console.warn("Failed to capture photo:", err);
    }

    setTimeout(() => {
      setIsShutterFlashing(false);
      if (!captured) return; // Stay open so the user can try again.
      onCapture(captured);
      onClose();
    }, 180);
  };

  const handleClose = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setIsOptionsExpanded(false);
    onClose();
  };

  const toggleFlash = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setFlash((prev) => (prev === "off" ? "on" : "off"));
  };

  const toggleFlip = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const toggleOptions = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setIsOptionsExpanded((prev) => !prev);
  };

  const bottomOffset = Math.max(insets.bottom, 16) + 16;

  return (
    <Host matchContents style={{ position: "absolute" }}>
      <BottomSheet
        isPresented={isOpen}
        onDismiss={onClose}
        // One detent, matching Finora's camera card; the camera fills it, so no strip.
        snapPoints={[{ fraction: 0.7 }]}
        contentPadding={0}
        showDragIndicator={false}
        containerColor="#000000"
        modifiers={sheetModifiers}
      >
        {/* Sized by the sheet, so the camera fills whatever height the platform gives it. */}
        <RNHostView>
          <View style={styles.sheetContainer}>
            {/* Permission Gate — per expo-native-ui media.md standards */}
            {!permission?.granted ? (
              <View style={styles.permissionContainer}>
                <View style={styles.permissionIconBadge}>
                  <ChatIcon name="camera" color="#ffffff" size={32} />
                </View>
                <Text style={styles.permissionTitle}>Camera Access Required</Text>
                <Text style={styles.permissionBody}>
                  Allow camera access to take a photo of anything and ask your mates about it.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={requestPermission}
                  style={({ pressed }) => [
                    styles.permissionButton,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.permissionButtonText}>Enable Camera</Text>
                </Pressable>
              </View>
            ) : (
              /* Live Camera View */
              <View style={styles.cameraFillContainer}>
                {/* Camera Preview - pointerEvents none guarantees it cannot intercept touches */}
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  flash={flash}
                  mirror={facing === "front"}
                  enableTorch={flash === "on"}
                  active={isOpen}
                  pointerEvents="none"
                />

                {/* Shutter White Flash effect */}
                {isShutterFlashing && (
                  <Animated.View
                    pointerEvents="none"
                    entering={FadeIn.duration(40)}
                    exiting={FadeOut.duration(140)}
                    style={[StyleSheet.absoluteFill, styles.shutterFlash]}
                  />
                )}

                {/* Dismiss backdrop when options are expanded */}
                {isOptionsExpanded && (
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setIsOptionsExpanded(false)}
                  />
                )}

                {/* Full-bleed Overlay Container for proper Hit-Testing of all controls */}
                <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  {/* Bottom Main Controls Row */}
                  <View
                    pointerEvents="box-none"
                    style={[
                      styles.bottomControlsRow,
                      {
                        bottom: bottomOffset,
                        paddingHorizontal: 24,
                      },
                    ]}
                  >
                    {/* Left Slot: Back (<) button */}
                    <GlassButton
                      onPress={handleClose}
                      accessibilityLabel="Back"
                    >
                      <ChatIcon name="chevronLeft" color="#ffffff" size={22} />
                    </GlassButton>

                    {/* Center Slot: Dual-ring Shutter button */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Take photo"
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      onPress={handleCapture}
                      style={({ pressed }) => [
                        styles.shutterOuterRing,
                        pressed && styles.shutterPressed,
                      ]}
                    >
                      <View style={styles.shutterInnerCircle} />
                    </Pressable>

                    {/* Right Slot: More (•••) button when collapsed, or placeholder when expanded */}
                    {!isOptionsExpanded ? (
                      <GlassButton
                        onPress={toggleOptions}
                        accessibilityLabel="More camera options"
                      >
                        <ChatIcon name="more" color="#ffffff" size={22} />
                      </GlassButton>
                    ) : (
                      <View style={{ width: 48, height: 48 }} />
                    )}
                  </View>

                  {/* Right Floating Stack: Expanded vertical stack directly inside full-bleed overlay */}
                  {isOptionsExpanded && (
                    <Animated.View
                      entering={FadeIn.duration(160)}
                      exiting={FadeOut.duration(120)}
                      style={[
                        styles.expandedStack,
                        {
                          bottom: bottomOffset,
                          right: 24,
                        },
                      ]}
                    >
                      {/* Flash Toggle */}
                      <GlassButton
                        onPress={toggleFlash}
                        accessibilityLabel={flash === "on" ? "Flash on" : "Flash off"}
                        active={flash === "on"}
                      >
                        <ChatIcon
                          name={flash === "on" ? "flash" : "flashOff"}
                          color={flash === "on" ? "#000000" : "#ffffff"}
                          size={22}
                        />
                      </GlassButton>

                      {/* Flip Camera */}
                      <GlassButton
                        onPress={toggleFlip}
                        accessibilityLabel="Flip camera"
                      >
                        <ChatIcon name="flip" color="#ffffff" size={22} />
                      </GlassButton>

                      {/* Close / Collapse stack */}
                      <GlassButton
                        onPress={toggleOptions}
                        accessibilityLabel="Close camera options"
                      >
                        <ChatIcon name="close" color="#ffffff" size={20} />
                      </GlassButton>
                    </Animated.View>
                  )}
                </View>
              </View>
            )}
          </View>
        </RNHostView>
      </BottomSheet>
    </Host>
  );
}

/**
 * Liquid Glass circular button matching native iOS ChatGPT camera chrome.
 * Uses Pressable with continuous hit-slop and active press transforms.
 */
function GlassButton({
  children,
  onPress,
  accessibilityLabel,
  active = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      style={({ pressed }) => [
        styles.glassButton,
        active && styles.glassButtonActive,
        pressed && styles.glassButtonPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000000",
    overflow: "hidden",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  cameraFillContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#000000",
  },
  permissionIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 21,
    fontFamily: "DMSans_700Bold",
    color: "#ffffff",
    marginBottom: 10,
    textAlign: "center",
  },
  permissionBody: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 290,
  },
  permissionButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  permissionButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: "#ffffff",
  },
  shutterFlash: {
    backgroundColor: "#ffffff",
    zIndex: 100,
  },
  bottomControlsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
  },
  shutterOuterRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  shutterInnerCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ffffff",
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.88,
  },
  expandedStack: {
    position: "absolute",
    gap: 14,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 60,
  },
  glassButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(35, 35, 35, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  glassButtonPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.94 }],
  },
  glassButtonActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
});
