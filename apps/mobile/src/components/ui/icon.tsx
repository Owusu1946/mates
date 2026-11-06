import React from "react";
import type { ColorValue } from "react-native";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import CompassIcon from "@hugeicons/core-free-icons/CompassIcon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon";
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon";
import Notification03Icon from "@hugeicons/core-free-icons/Notification03Icon";
import Settings02Icon from "@hugeicons/core-free-icons/Settings02Icon";
import Tick01Icon from "@hugeicons/core-free-icons/Tick01Icon";
import UserIcon from "@hugeicons/core-free-icons/UserIcon";
import EyeIcon from "@hugeicons/core-free-icons/EyeIcon";
import EyeClosedIcon from "@hugeicons/core-free-icons/EyeClosedIcon";
import { HugeiconsIcon } from "@hugeicons/react-native";
type IconSvgObject = readonly (readonly [string, { readonly [key: string]: string | number }])[];

export type IconName =
  | "home"
  | "user"
  | "settings"
  | "bell"
  | "menu"
  | "chevron-right"
  | "check"
  | "compass"
  | "info"
  | "eye"
  | "eye-off";

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

const ICON_MAP: Record<IconName, IconSvgObject> = {
  home: Home01Icon,
  user: UserIcon,
  settings: Settings02Icon,
  bell: Notification03Icon,
  menu: Menu01Icon,
  "chevron-right": ArrowRight01Icon,
  check: Tick01Icon,
  compass: CompassIcon,
  info: InformationCircleIcon,
  eye: EyeIcon,
  "eye-off": EyeClosedIcon,
};

export function Icon({ name, size = 24, color = "#000", strokeWidth = 1.5 }: IconProps) {
  const icon = ICON_MAP[name] ?? Home01Icon;
  return <HugeiconsIcon icon={icon} size={size} color={color as string} strokeWidth={strokeWidth} />;
}

export { HugeiconsIcon };
