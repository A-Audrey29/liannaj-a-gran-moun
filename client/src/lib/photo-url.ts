export function getPhotoUrl(photoPath: string | null | undefined): string | undefined {
  if (!photoPath) return undefined;
  const match = photoPath.match(/^\/uploads\/(.+)$/);
  if (match) {
    return `/api/photos/${match[1]}`;
  }
  return photoPath;
}
