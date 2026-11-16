import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import * as Location from "expo-location";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { CardButton } from "./card-button";

/** Ask first; the user reviews the platform-geocoded address before sending it in chat. */
export function RideLocationCard({ state }: { state: WorkflowCard }) {
  const trip = state.rideLocation;
  const { colors } = useTheme();
  const aui = useAui();
  const draft = useAuiState((value) => value.composer.text);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const running = useAuiState((value) => value.thread.isRunning);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [declined, setDeclined] = useState(false);
  const inFlight = useRef(false);
  if (!trip) return null;

  async function share() {
    if (inFlight.current || running || !trip) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location is unavailable. Enter your starting place in chat.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      if (!address) {
        setError("Couldn't find a nearby address. Enter your starting place in chat.");
        return;
      }
      const expected = trip.country === "gh" ? "GH" : "GB";
      if (!address.isoCountryCode) {
        setError("Couldn't confirm the country. Enter your starting place in chat.");
        return;
      }
      if (address.isoCountryCode.toUpperCase() !== expected) {
        setError("Your location appears to be in a different country. Enter the starting place in chat.");
        return;
      }
      const street = [address.streetNumber, address.street].filter(Boolean).join(" ");
      const parts = [...new Set([street || address.name, address.district, address.city, address.region].filter((part): part is string => !!part?.trim()))];
      if (!parts.length || /[-+]?\d+\.\d+\s*[, ]\s*[-+]?\d+\.\d+/.test(parts.join(", "))) {
        setError("Couldn't find a nearby address. Enter your starting place in chat.");
        return;
      }
      const place = parts.join(", ");
      const request = `Check ${trip.mode === "transit" ? "public transport" : trip.mode === "rides" ? "ride prices" : "rides and public transport"} from ${place} to ${trip.destination} in ${trip.country === "gh" ? "Ghana" : "Great Britain"}.`;
      const current = latestDraft.current;
      aui.thread.composer().setText(current.trim() ? `${current}\n${request}` : request);
      setPrepared(true);
    } catch {
      setError("Couldn't get your location. Enter your starting place in chat.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <View style={{ gap: 8, paddingVertical: 6 }}>
    <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 16 }}>Use your location?</Text>
    <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 20 }}>We'll add a nearby address to your message for you to review. If you send it, it will be saved in chat and shared with Sail.</Text>
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontSize: 13 }}>{error}</Text> : null}
    {prepared ? <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: 13 }}>Review the address in your message, then send it.</Text> : declined ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>Enter your starting place in chat.</Text> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><CardButton label={busy ? "Finding your location…" : "Share location"} disabled={busy || running} onPress={() => void share()} /><CardButton variant="text" label="Not now" disabled={busy || running} onPress={() => setDeclined(true)} /></View>}
  </View>;
}
