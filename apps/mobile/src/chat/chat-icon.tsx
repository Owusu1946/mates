import {
  Add01Icon,
  Activity01Icon,
  AiBrain01Icon,
  Clock01Icon,
  DiceFaces03Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  Camera01Icon,
  CameraRotated01Icon,
  Cancel01Icon,
  CheckIcon,
  ClipboardIcon,
  Copy01Icon,
  Edit02Icon,
  FlashIcon,
  FlashOffIcon,
  Image01Icon,
  MenuTwoLineIcon,
  Mic01Icon,
  Link01Icon,
  MessageAdd01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
  ScanIcon,
  Search01Icon,
  Globe02Icon,
  Settings01Icon,
  SentIcon,
  StopIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Call02FreeIcons,
  CallEnd01Icon,
  MicOff01Icon,
  VolumeHighIcon,
  VolumeOffIcon,
  UserAdd01Icon,
  ClosedCaptionIcon,
  ArrowDown01Icon,
  Presentation01Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";

const icons = {
  add: Add01Icon,
  call: Call02FreeIcons,
  callEnd: CallEnd01Icon,
  micOff: MicOff01Icon,
  speaker: VolumeHighIcon,
  speakerOff: VolumeOffIcon,
  addUser: UserAdd01Icon,
  captions: ClosedCaptionIcon,
  chevronDown: ArrowDown01Icon,
  arrowUp: ArrowUp02Icon,
  camera: Camera01Icon,
  chevronLeft: ArrowLeft01Icon,
  close: Cancel01Icon,
  files: Attachment01Icon,
  flash: FlashIcon,
  flashOff: FlashOffIcon,
  flip: CameraRotated01Icon,
  more: MoreHorizontalIcon,
  photos: Image01Icon,
  scan: ScanIcon,
  mic: Mic01Icon,
  menu: MenuTwoLineIcon,
  search: Search01Icon,
  globe: Globe02Icon,
  feed: Activity01Icon,
  ideas: AiBrain01Icon,
  tasks: ClipboardIcon,
  connections: Link01Icon,
  compose: MessageAdd01Icon,
  send: SentIcon,
  stop: StopIcon,
  copy: Copy01Icon,
  check: CheckIcon,
  reload: RefreshIcon,
  settings: Settings01Icon,
  edit: Edit02Icon,
  thumbsUp: ThumbsUpIcon,
  thumbsDown: ThumbsDownIcon,
  previous: ArrowLeft01Icon,
  next: ArrowRight01Icon,
  shuffle: DiceFaces03Icon,
  clock: Clock01Icon,
  presentation: Presentation01Icon,
  share: Share08Icon,
};

export function ChatIcon({
  name,
  color,
  size = 20,
}: {
  name: keyof typeof icons;
  color: string;
  size?: number;
}) {
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      color={color}
      strokeWidth={1.8}
    />
  );
}
