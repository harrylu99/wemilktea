export function getMobileStorePreviewId(
  storeId: string,
  isDesktopLayout: boolean
) {
  return isDesktopLayout ? null : storeId;
}
