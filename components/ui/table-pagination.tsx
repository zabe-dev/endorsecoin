'use client';

import { getPaginationItems } from '@/lib/ui/pagination';
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
}: {
  pagination: TablePaginationState;
  className?: string;
}) {
  const router = useRouter();
  if (pagination.pages <= 1) return null;

  const items = getPaginationItems({ count: pagination.pages, page: pagination.page });

  function goToPage(page: number) {
    const params = new URLSearchParams(window.location.search);
    if (page <= 1) params.delete('page');
    else params.set('page', String(page));
    const query = params.toString();
    router.push(`${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  return (
    <div className={`table-pagination ${className}`.trim()}>
      <span>
        Showing {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}–
        {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
      </span>
      <div>
        <button
          type="button"
          disabled={pagination.page === 1}
          onClick={() => goToPage(Math.max(1, pagination.page - 1))}
        >
          Previous
        </button>
        {items.map((item) =>
          typeof item === 'number' ? (
            <button
              type="button"
              className={pagination.page === item ? 'active' : ''}
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
          disabled={pagination.page === pagination.pages}
          onClick={() => goToPage(Math.min(pagination.pages, pagination.page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
