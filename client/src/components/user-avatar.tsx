import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPhotoUrl } from "@/lib/photo-url";

/**
 * Profile photo, or the person's initials when there is no photo or it fails
 * to load (a bare <img> without src shows the broken-image alt text).
 *
 * `decorative`: pass it when the name is already written next to the photo, so
 * screen readers do not read the name twice.
 */
export function UserAvatar({
  photo,
  firstName,
  lastName,
  className = "w-12 h-12",
  fallbackClassName = "",
  decorative = false,
}: {
  photo: string | null | undefined;
  firstName: string;
  lastName: string;
  className?: string;
  fallbackClassName?: string;
  decorative?: boolean;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={getPhotoUrl(photo)} alt={decorative ? "" : `${firstName} ${lastName}`} className="object-cover" />
      <AvatarFallback
        aria-hidden={decorative ? true : undefined}
        className={`bg-[#e8d7fe] text-[#6d28d9] font-bold ${fallbackClassName}`}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
