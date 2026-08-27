"use client";

import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "./ui/avatar";
import { Dropdown, DropdownItem } from "./ui/dropdown";
import { useSession } from "./session-provider";

export function ProfileMenu() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const name = session?.name ?? "Guest";
  const email = session?.email ?? "not signed in";

  return (
    <Dropdown
      triggerLabel={`Account menu for ${name}`}
      triggerClassName="w-auto gap-1.5 pl-1 pr-1.5"
      panelClassName="w-60"
      trigger={
        <span className="flex items-center gap-1.5">
          <Avatar name={name} size={26} />
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      }
    >
      <div className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Avatar name={name} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {name}
          </span>
          <span className="block truncate font-mono text-xs text-muted">
            {email}
          </span>
        </span>
      </div>

      <div className="py-1">
        <DropdownItem icon={User} onSelect={() => router.push("/settings")}>
          Profile
        </DropdownItem>
        <DropdownItem icon={Settings} onSelect={() => router.push("/settings")}>
          Settings
        </DropdownItem>
      </div>

      <div className="border-t border-line py-1">
        <DropdownItem icon={LogOut} onSelect={signOut} destructive>
          Sign out
        </DropdownItem>
      </div>
    </Dropdown>
  );
}
