export function getPhotoUrl(photoPath: string | null | undefined): string | undefined {
  if (!photoPath) return undefined;
  // Old accounts point to ui-avatars.com: loading it sends the person's name
  // to a third party. The initials avatar replaces it.
  if (photoPath.startsWith("https://ui-avatars.com/")) return undefined;
  const match = photoPath.match(/^\/uploads\/(.+)$/);
  if (match) {
    return `/api/photos/${match[1]}`;
  }
  return photoPath;
}
