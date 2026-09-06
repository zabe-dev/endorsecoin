'use client';

import { getPaginationItems } from '@/lib/ui/pagination';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminTablePagination } from '../types';

const pageSize = 10;

export function AdminPanel<T>({
  eyebrow,
  title,
  count,
  note,
  rows,
  searchPlaceholder,
  search,
  empty,
  action,
  pagination,
  searchQuery,
  isPending = false,
  onPageChange,
  onSearchChange,
  renderTable,
}: {
  eyebrow: string;
  title: string;
  count: string;
  note: string;
  rows: T[];
  searchPlaceholder: string;
  search: (row: T) => string[];
  empty: string;
  action?: ReactNode;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
  renderTable: (rows: T[]) => ReactNode;
}) {
  const normalizedSearchQuery = searchQuery || '';
  const [searchState, setSearchState] = useState(() => ({
    query: normalizedSearchQuery,
    source: normalizedSearchQuery,
  }));
  const [page, setPage] = useState(0);

  if (searchState.source !== normalizedSearchQuery) {
    setSearchState({ query: normalizedSearchQuery, source: normalizedSearchQuery });
  }

  const query =
    searchState.source === normalizedSearchQuery ? searchState.query : normalizedSearchQuery;
  const normalizedQuery = query.trim().toLowerCase();
  const usesServerSearch = Boolean(pagination && onSearchChange);
  const filteredRows = useMemo(
    () =>
      normalizedQuery && !usesServerSearch
        ? rows.filter((row) =>
            search(row).some((value) => value.toLowerCase().includes(normalizedQuery)),
          )
        : rows,
    [normalizedQuery, rows, search, usesServerSearch],
  );
  const usesServerPagination = Boolean(pagination);
  const pageCount = usesServerPagination
    ? Math.max(1, pagination?.pages || 1)
    : Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = usesServerPagination
    ? Math.max(0, Math.min((pagination?.page || 1) - 1, pageCount - 1))
    : Math.min(page, pageCount - 1);
  const visibleRows = usesServerPagination
    ? filteredRows
    : filteredRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const totalResults = usesServerPagination ? pagination?.total || 0 : filteredRows.length;
  const pageItems = getPaginationItems({ count: pageCount, page: safePage + 1 });

  useEffect(() => {
    if (!usesServerSearch) return;
    const nextQuery = query.trim();
    if (nextQuery === normalizedSearchQuery) return;

    const timer = window.setTimeout(() => {
      onSearchChange?.(nextQuery);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [normalizedSearchQuery, onSearchChange, query, usesServerSearch]);

  function selectPage(nextPage: number) {
    if (usesServerPagination && onPageChange) {
      onPageChange(nextPage);
      return;
    }
    setPage(nextPage - 1);
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-title">
        <div>
          <small>{eyebrow}</small>
          <h2>{title}</h2>
        </div>
        <div className="admin-panel-title-actions">
          {action}
          <span>{count}</span>
        </div>
      </div>
      <p className="admin-panel-note">{note}</p>
      <div className="admin-table-tools">
        <label className="admin-search">
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setSearchState({ query: event.target.value, source: normalizedSearchQuery });
              setPage(0);
            }}
            placeholder={searchPlaceholder}
          />
        </label>
        <span>
          {totalResults} result{totalResults === 1 ? '' : 's'}
        </span>
      </div>
      <div className="admin-table-wrap">
        {visibleRows.length ? (
          renderTable(visibleRows)
        ) : (
          <div className="admin-empty-state">
            <span className="project-table-empty">{empty}</span>
          </div>
        )}
      </div>
      <div className="admin-pagination">
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <div>
          <button
            type="button"
            disabled={isPending || safePage === 0}
            onClick={() => selectPage(safePage)}
          >
            Previous
          </button>
          {pageItems.map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                className={safePage + 1 === item ? 'active' : ''}
                type="button"
                disabled={isPending}
                onClick={() => selectPage(item)}
              >
                {item}
              </button>
            ) : (
              <span className="admin-pagination-ellipsis" key={item} aria-hidden="true">
                ...
              </span>
            ),
          )}
          <button
            type="button"
            disabled={isPending || safePage >= pageCount - 1}
            onClick={() => selectPage(safePage + 2)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
