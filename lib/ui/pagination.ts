export type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis';

type PaginationOptions = {
  count: number;
  page: number;
  siblingCount?: number;
  boundaryCount?: number;
};

export function getPaginationItems({
  count,
  page,
  siblingCount = 1,
  boundaryCount = 1,
}: PaginationOptions): PaginationItem[] {
  const pageCount = Math.max(1, Math.floor(count));
  const currentPage = clamp(Math.floor(page), 1, pageCount);
  const safeSiblingCount = Math.max(0, Math.floor(siblingCount));
  const safeBoundaryCount = Math.max(0, Math.floor(boundaryCount));
  const startPages = range(1, Math.min(safeBoundaryCount, pageCount));
  const endPages = range(
    Math.max(pageCount - safeBoundaryCount + 1, safeBoundaryCount + 1),
    pageCount,
  );
  const siblingsStart = Math.max(
    Math.min(
      currentPage - safeSiblingCount,
      pageCount - safeBoundaryCount - safeSiblingCount * 2 - 1,
    ),
    safeBoundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(
      currentPage + safeSiblingCount,
      safeBoundaryCount + safeSiblingCount * 2 + 2,
    ),
    endPages.length ? endPages[0] - 2 : pageCount - 1,
  );
  const items: PaginationItem[] = [...startPages];

  if (siblingsStart > safeBoundaryCount + 2) {
    items.push('start-ellipsis');
  } else if (safeBoundaryCount + 1 < pageCount - safeBoundaryCount + 1) {
    items.push(safeBoundaryCount + 1);
  }

  items.push(...range(siblingsStart, siblingsEnd));

  if (siblingsEnd < pageCount - safeBoundaryCount - 1) {
    items.push('end-ellipsis');
  } else if (pageCount - safeBoundaryCount > safeBoundaryCount) {
    items.push(pageCount - safeBoundaryCount);
  }

  items.push(...endPages);

  return dedupePaginationItems(items, pageCount);
}

function range(start: number, end: number) {
  const length = end - start + 1;
  if (length <= 0) return [];
  return Array.from({ length }, (_, index) => start + index);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function dedupePaginationItems(items: PaginationItem[], pageCount: number) {
  const seen = new Set<number | string>();
  return items.filter((item) => {
    if (typeof item === 'number' && (item < 1 || item > pageCount)) return false;
    const key = item;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
