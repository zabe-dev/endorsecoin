'use client';

import { getPaginationItems } from '@/lib/ui/pagination';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export type TablePaginationState = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

export function TablePagination({
  pagination,
  className = '',
  scrollTargetId,
}: {
  pagination?: TablePaginationState;
  className?: string;
  scrollTargetId?: string;
}) {
  const router = useRouter();
  const rawPage = pagination?.page;
  const rawPageSize = pagination?.pageSize;
  const rawTotal = pagination?.total;
  const rawPages = pagination?.pages;
  const page = isFiniteNumber(rawPage) ? rawPage : 1;
  const pageSize = isFiniteNumber(rawPageSize) ? rawPageSize : 0;
  const total = isFiniteNumber(rawTotal) ? rawTotal : 0;
  const pages = isFiniteNumber(rawPages) ? rawPages : 0;

  if (pages <= 1) return null;

  const items = getPaginationItems({ count: pages, page });

  function goToPage(page: number) {
    const params = new URLSearchParams(window.location.search);
    if (page <= 1) params.delete('page');
    else params.set('page', String(page));
    const query = params.toString();
    const hash = scrollTargetId ? `#${scrollTargetId}` : window.location.hash;
    router.push(`${window.location.pathname}${query ? `?${query}` : ''}${hash}`);
  }

  return (
    <div className={`table-pagination ${className}`.trim()}>
      <span>
        Showing {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} of {total}
      </span>
      <div>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => goToPage(Math.max(1, page - 1))}
        >
          <ChevronLeft aria-hidden="true" />
          <span className="sr-only">Previous</span>
        </button>
        {items.map((item) =>
          typeof item === 'number' ? (
            <button
              type="button"
              className={page === item ? 'active' : ''}
              key={item}
              onClick={() => goToPage(item)}
            >
              {item}
            </button>
          ) : (
            <span className="table-pagination-ellipsis" key={item} aria-hidden="true">
              ...
            </span>
          ),
        )}
        <button
          type="button"
          disabled={page === pages}
          onClick={() => goToPage(Math.min(pages, page + 1))}
        >
          <ChevronRight aria-hidden="true" />
          <span className="sr-only">Next</span>
        </button>
      </div>
    </div>
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
