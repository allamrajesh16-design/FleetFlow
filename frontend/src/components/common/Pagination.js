import React from 'react';
import Button from './Button';
import { Select } from '../forms';
import './Pagination.css';

export default function Pagination({
  page = 1,
  pageSize = 10,
  totalCount = 0,
  totalPages = 1,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = '',
}) {
  const effectiveCount = totalCount || 0;
  const startEntry = effectiveCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, effectiveCount);
  const pages = Math.max(1, totalPages || Math.ceil(effectiveCount / pageSize));

  // Compact indicator for mobile <= 480px or 360px
  return (
    <nav className={`pagination-container ${className}`} aria-label="Pagination Navigation">
      <div className="pagination-info">
        <span className="pagination-counter-full">
          Showing <strong>{startEntry}</strong> to <strong>{endEntry}</strong> of{' '}
          <strong>{effectiveCount}</strong>
        </span>
        <span className="pagination-counter-compact">
          {page} of {pages} ({effectiveCount})
        </span>

        {onPageSizeChange && (
          <div className="pagination-size-selector">
            <Select
              id="pagination-page-size"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="pagination-size-select"
              options={pageSizeOptions.map((opt) => ({ value: opt, label: `${opt} / page` }))}
            />
          </div>
        )}
      </div>

      <div className="pagination-actions">
        {/* First Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pagination-btn pagination-first"
          disabled={page <= 1}
          onClick={() => onPageChange && onPageChange(1)}
          aria-label="First page"
        >
          « First
        </Button>

        {/* Prev Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pagination-btn pagination-prev"
          disabled={page <= 1}
          onClick={() => onPageChange && onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Prev
        </Button>

        {/* Page Numbers with Ellipsis */}
        <div className="pagination-pages" role="group" aria-label="Page selection">
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => {
              return (
                p === 1 ||
                p === pages ||
                Math.abs(p - page) <= 1
              );
            })
            .map((p, idx, arr) => {
              const prevP = arr[idx - 1];
              const showEllipsis = prevP && p - prevP > 1;

              return (
                <React.Fragment key={p}>
                  {showEllipsis && (
                    <span className="pagination-ellipsis" aria-hidden="true">
                      …
                    </span>
                  )}
                  <Button
                    type="button"
                    variant={p === page ? 'primary' : 'ghost'}
                    size="sm"
                    className={`pagination-num ${p === page ? 'active' : ''}`}
                    onClick={() => onPageChange && onPageChange(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </Button>
                </React.Fragment>
              );
            })}
        </div>

        {/* Next Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pagination-btn pagination-next"
          disabled={page >= pages}
          onClick={() => onPageChange && onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </Button>

        {/* Last Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pagination-btn pagination-last"
          disabled={page >= pages}
          onClick={() => onPageChange && onPageChange(pages)}
          aria-label="Last page"
        >
          Last »
        </Button>
      </div>
    </nav>
  );
}

