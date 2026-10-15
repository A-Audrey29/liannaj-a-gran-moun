import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPhotoUrl } from "@/lib/photo-url";

/**
 * Profile photo, or the person's initials when there is no photo or it fails
 * to load (a bare <img> without src shows the broken-image alt text).
 */
export function UserAvatar({
  photo,
  firstName,
  lastName,
  className = "w-12 h-12",
}: {
  photo: string | null | undefined;
  firstName: string;
  lastName: string;
  className?: string;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={getPhotoUrl(photo)} alt={`${firstName} ${lastName}`} className="object-cover" />
      <AvatarFallback className="bg-[#e8d7fe] text-[#8b5cf6] font-bold">{initials}</AvatarFallback>
    </Avatar>
  );
}
