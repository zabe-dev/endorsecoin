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

  function hrefForPage(page: number) {
    const hash = scrollTargetId ? `#${scrollTargetId}` : '';
    return page <= 1 ? hash || '?' : `?page=${page}${hash}`;
  }

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
        Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of{' '}
        {total}
      </span>
      <div>
        <a
          aria-disabled={page === 1}
          className={page === 1 ? 'disabled' : ''}
          href={hrefForPage(Math.max(1, page - 1))}
          onClick={(event) => {
            event.preventDefault();
            if (page === 1) return;
            goToPage(Math.max(1, page - 1));
          }}
        >
          <ChevronLeft aria-hidden="true" />
          <span className="sr-only">Previous</span>
        </a>
        {items.map((item) =>
          typeof item === 'number' ? (
            <a
              className={page === item ? 'active' : ''}
              href={hrefForPage(item)}
              key={item}
              onClick={(event) => {
                event.preventDefault();
                if (page === item) return;
                goToPage(item);
              }}
            >
              {item}
            </a>
          ) : (
            <span className="table-pagination-ellipsis" key={item} aria-hidden="true">
              ...
            </span>
          ),
        )}
        <a
          aria-disabled={page === pages}
          className={page === pages ? 'disabled' : ''}
          href={hrefForPage(Math.min(pages, page + 1))}
          onClick={(event) => {
            event.preventDefault();
            if (page === pages) return;
            goToPage(Math.min(pages, page + 1));
          }}
        >
          <ChevronRight aria-hidden="true" />
          <span className="sr-only">Next</span>
        </a>
      </div>
    </div>
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
