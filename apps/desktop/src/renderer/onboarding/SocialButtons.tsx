import { Button } from "../components/ui/Button.tsx";

/**
 * Apple and Google, as on the phone. They do nothing yet: real sign-in comes with @clerk/electron,
 * which opens the system browser and returns through a mates:// link.
 */
export function SocialButtons() {
  return (
    <div className="flex flex-col gap-2.5">
      <Button variant="outline" size="xl" icon="apple" className="w-full">
        Continue with Apple
      </Button>
      <Button variant="outline" size="xl" icon="google" className="w-full">
        Continue with Google
      </Button>
    </div>
  );
}
