import React from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { GlassCard } from "./ui/glass-card";
import { haptic } from "../haptics";
import { useAppStore } from "../store/use-app-store";
import { useTheme } from "../theme/provider";

export function CounterCard() {
  const { count, increment, decrement, reset } = useAppStore();
  const { colors } = useTheme();

  const handleDecrement = () => {
    haptic.light();
    decrement();
  };
  const handleReset = () => {
    haptic.medium();
    reset();
  };
  const handleIncrement = () => {
    haptic.light();
    increment();
  };

  return (
    <GlassCard style={styles.card} testID="counter-card">
      <Text style={[styles.eyebrow, { color: colors.primary }]}>Zustand Store</Text>
      <Text style={[styles.count, { color: colors.text }]} testID="counter-value">{count}</Text>
      <View style={styles.actions}>
        <Button title="-" onPress={handleDecrement} testID="counter-decrement" />
        <Button title="Reset" onPress={handleReset} testID="counter-reset" />
        <Button title="+" onPress={handleIncrement} testID="counter-increment" />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  count: {
    fontSize: 36,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
});
