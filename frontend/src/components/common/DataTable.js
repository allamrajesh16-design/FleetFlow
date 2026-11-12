import React, { useState, useEffect, useRef } from 'react';
import SearchBar from './SearchBar';
import Select from './Select';
import Button from './Button';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import ViewSwitch from './ViewSwitch';
import Pagination from './Pagination';
import useBreakpoint from '../../hooks/useBreakpoint';
import { safeGet, normalizeList } from '../../utils/safeHelpers';
import './DataTable.css';

/**
 * DataTable Component
 * Features:
 * - Columns definition with optional render, width, align, and sorting
 * - Sticky header, hover row, aligned columns (left text, right numbers/money), no wrapping in headings
 * - Responsive: Table on >= 768px, Cards on < 768px (automatic)
 * - Desktop View Switch: Table | Cards toggle (persisted via localStorage)
 * - Search box with debounce
 * - Dynamic filter dropdowns
 * - Server-side pagination and entry counter
 * - Skeleton loading state and error state with Retry
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  error = null,
  errorStatus = null,
  onRetry = null,
  keyField = 'id',
  // Search
  search = '',
  searchValue,
  onSearchChange = null,
  searchPlaceholder = 'Search...',
  // Filters: array of { key, label, value, options, onChange }
  filters = [],
  // Top actions slot
  actions = null,
  // View mode: 'auto' | 'table' | 'cards'
  viewMode: controlledViewMode = null,
  onViewModeChange = null,
  storageKey = '',
  enableViewSwitch = false,
  // Sorting: current ordering string and callback
  ordering = '',
  onOrderingChange = null,
  // Pagination
  page = 1,
  pageSize = 10,
  count = 0,
  totalCount,
  totalPages = 1,
  onPageChange = null,
  onPageSizeChange = null,
  // Empty message
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching your criteria.',
  emptyAction = null,
  emptyType = 'default',
  className = '',
}) {
  const effectiveSearch = searchValue !== undefined ? searchValue : search;
  const effectiveCount = totalCount !== undefined ? totalCount : count;

  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem('ff_table_density') || 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  const toggleDensity = () => {
    const next = density === 'comfortable' ? 'compact' : 'comfortable';
    setDensity(next);
    try {
      localStorage.setItem('ff_table_density', next);
    } catch {}
  };

  const [internalViewMode, setInternalViewMode] = useState(() => {
    if (storageKey) {
      try {
        return localStorage.getItem(storageKey) || 'table';
      } catch (e) {
        return 'table';
      }
    }
    return 'table';
  });

  const activeViewMode = controlledViewMode || (storageKey ? internalViewMode : 'auto');

  const handleViewModeChange = (mode) => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, mode);
      } catch (e) {
        // Ignore
      }
    }
    setInternalViewMode(mode);
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const { isPhone } = useBreakpoint();

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const isNarrow = containerWidth < 720;
  const isMedium = containerWidth >= 720 && containerWidth <= 1000;

  let renderAsCards = false;
  if (activeViewMode === 'cards') {
    renderAsCards = true;
  } else if (activeViewMode === 'table') {
    renderAsCards = false;
  } else {
    // 'auto' mode driven strictly by container width (< 720px)
    renderAsCards = isNarrow;
  }

  const containerMode = renderAsCards ? 'cards' : isMedium ? 'table-medium' : 'table-wide';

  const handleHeaderClick = (col) => {
    if (!col.sortable || !onOrderingChange) return;
    const currentKey = col.key;
    if (ordering === currentKey) {
      onOrderingChange(`-${currentKey}`);
    } else if (ordering === `-${currentKey}`) {
      onOrderingChange('');
    } else {
      onOrderingChange(currentKey);
    }
  };

  const renderSortIndicator = (col) => {
    if (!col.sortable) return null;
    const currentKey = col.key;
    if (ordering === currentKey) {
      return <span className="datatable-sort-icon active">▲</span>;
    }
    if (ordering === `-${currentKey}`) {
      return <span className="datatable-sort-icon active">▼</span>;
    }
    return <span className="datatable-sort-icon muted">⇅</span>;
  };

  // Find specialized columns for card view rendering
  const statusCol = columns.find(
    (c) =>
      c.key?.toLowerCase().includes('status') ||
      c.label?.toLowerCase().includes('status')
  );
  const actionCol = columns.find(
    (c) =>
      c.key?.toLowerCase().includes('action') ||
      c.label?.toLowerCase().includes('action')
  );
  const titleCol = columns.find((c) => c !== statusCol && c !== actionCol);
  const detailCols = columns.filter(
    (c) => c !== statusCol && c !== actionCol && c !== titleCol
  );

  const rows = normalizeList(data).items;

  // Safe cell renderer wrapped in try/catch to ensure one bad row/column never crashes table
  const renderCellSafe = (col, row, rIdx) => {
    if (!col) return '-';
    try {
      if (typeof col.render === 'function') {
        const res = col.render(row, row, rIdx);
        return res !== undefined && res !== null ? res : '-';
      }
      return safeGet(row, col.key, '-');
    } catch (err) {
      console.error(
        `[DataTable] Cell render error in column "${col.key || col.label || 'unknown'}" for row id "${row?.id || rIdx}":`,
        err
      );
      return '-';
    }
  };

  const viewModeClass =
    activeViewMode === 'cards'
      ? 'datatable-force-cards'
      : activeViewMode === 'table'
      ? 'datatable-force-table'
      : 'datatable-auto-responsive';

  const densityClass = `density-${density}`;

  return (
    <div
      ref={containerRef}
      className={`datatable-wrapper ${viewModeClass} ${densityClass} ${className}`}
      data-container-mode={containerMode}
      data-container-width={Math.round(containerWidth)}
    >
      {/* Top Toolbar: Search, Filters, ViewSwitch, Density, and Action Buttons */}
      {(onSearchChange || filters.length > 0 || actions || enableViewSwitch) && (
        <div className="datatable-toolbar">
          <div className="datatable-toolbar-left">
            {onSearchChange && (
              <div className="datatable-search-container">
                <SearchBar
                  value={effectiveSearch}
                  onChange={onSearchChange}
                  placeholder={searchPlaceholder}
                  className="datatable-search-input"
                />
              </div>
            )}

            {filters.map((f) => (
              <div key={f.key} className="datatable-filter-item">
                <Select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  options={f.options}
                  className="datatable-filter-select"
                />
              </div>
            ))}
          </div>

          <div className="datatable-toolbar-right">
            {!isPhone && !isNarrow && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="density-toggle-btn"
                onClick={toggleDensity}
                title={`Switch density (currently ${density})`}
              >
                {density === 'comfortable' ? '⇕ Compact' : '⇕ Comfortable'}
              </Button>
            )}
            {enableViewSwitch && !isPhone && !isNarrow && (
              <ViewSwitch
                view={renderAsCards ? 'cards' : 'table'}
                onChange={handleViewModeChange}
                storageKey={storageKey}
              />
            )}
            {actions}
          </div>
        </div>
      )}

      {/* Main Table / Cards Container */}
      <div className="datatable-table-container">
        {error ? (
          <div className="datatable-state-box">
            <ErrorState message={error} status={errorStatus} onRetry={onRetry} />
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="datatable-state-box">
            <EmptyState
              type={emptyType}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          </div>
        ) : (
          <>
            {/* 1. Normal Table View (Desktop default, sticky header, hover row, aligned columns) */}
            <div className="datatable-responsive-table">
              <table className="datatable-table">
                <colgroup>
                  {columns.map((col, idx) => {
                    const isActions =
                      col.key === 'actions' ||
                      col.accessor === 'actions' ||
                      col.label === 'Actions' ||
                      col.header === 'Actions';
                    return (
                      <col
                        key={col.key || col.accessor || idx}
                        style={{
                          width: col.width || (isActions ? '220px' : undefined),
                          minWidth: col.minWidth || (isActions ? '200px' : undefined),
                          maxWidth: col.maxWidth,
                        }}
                      />
                    );
                  })}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map((col, idx) => {
                      const isActions =
                        col.key === 'actions' ||
                        col.accessor === 'actions' ||
                        col.label === 'Actions' ||
                        col.header === 'Actions';
                      const colLabel = col.label || col.header || col.title || '';
                      return (
                        <th
                          key={col.key || col.accessor || idx}
                          style={{
                            width: col.width || (isActions ? '220px' : undefined),
                            minWidth: col.minWidth || (isActions ? '200px' : undefined),
                            textAlign: col.align || (isActions ? 'right' : 'left'),
                            cursor: col.sortable ? 'pointer' : 'default',
                          }}
                          className={`datatable-th ${col.sortable ? 'sortable' : ''} ${
                            col.align === 'right' || isActions ? 'align-right' : ''
                          }`}
                          onClick={() => handleHeaderClick(col)}
                        >
                          <span className="datatable-th-inner">
                            {colLabel}
                            {renderSortIndicator(col)}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, rIdx) => (
                        <tr key={`skel-${rIdx}`} className="datatable-tr-skeleton">
                          {columns.map((col, cIdx) => (
                            <td key={`skel-c-${cIdx}`} className="datatable-td">
                              <div className="datatable-skeleton-bar" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : rows.map((row, rIdx) => (
                        <tr
                          key={row?.[keyField] || rIdx}
                          className="datatable-tr"
                          style={rIdx < 12 ? { animationDelay: `${rIdx * 35}ms` } : undefined}
                        >
                          {columns.map((col, cIdx) => {
                            const isActions =
                              col.key === 'actions' ||
                              col.accessor === 'actions' ||
                              col.label === 'Actions' ||
                              col.header === 'Actions';
                            const textAlign = col.align || (isActions ? 'right' : 'left');
                            return (
                              <td
                                key={col.key || col.accessor || cIdx}
                                style={{
                                  textAlign,
                                  minWidth: col.minWidth || (isActions ? '200px' : undefined),
                                  whiteSpace: isActions ? 'nowrap' : undefined,
                                }}
                                className={`datatable-td ${
                                  textAlign === 'right' ? 'align-right' : ''
                                }`}
                              >
                                {renderCellSafe(col, row, rIdx)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* 2. Responsive Cards View (Mobile auto, or desktop when Cards switch is chosen) */}
            <div className="datatable-cards-view">
              {loading ? (
                <div className="datatable-cards-grid">
                  {Array.from({ length: 4 }).map((_, rIdx) => (
                    <div key={`skel-card-${rIdx}`} className="datatable-card skeleton">
                      <div className="datatable-skeleton-bar" style={{ width: '60%', height: 18 }} />
                      <div className="datatable-skeleton-bar" style={{ width: '100%', height: 14 }} />
                      <div className="datatable-skeleton-bar" style={{ width: '80%', height: 14 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="datatable-cards-grid">
                  {rows.map((row, rIdx) => (
                    <div
                      key={row?.[keyField] || rIdx}
                      className="datatable-card"
                      style={rIdx < 12 ? { animationDelay: `${rIdx * 35}ms` } : undefined}
                    >
                      {/* Status badge and primary identifier at top */}
                      <div className="datatable-card-header">
                        <div className="datatable-card-title">
                          {titleCol
                            ? renderCellSafe(titleCol, row, rIdx)
                            : `#${row?.[keyField] || rIdx + 1}`}
                        </div>
                        {statusCol && (
                          <div className="datatable-card-badge">
                            {renderCellSafe(statusCol, row, rIdx)}
                          </div>
                        )}
                      </div>

                      {/* Detail key-value pairs */}
                      <div className="datatable-card-body">
                        {detailCols.map((col, cIdx) => (
                          <div
                            className="datatable-card-row"
                            key={col.key || col.label || col.header || col.accessor || cIdx}
                          >
                            <span className="datatable-card-label">
                              {col.label || col.title}:
                            </span>
                            <span
                              className={`datatable-card-value ${
                                col.align === 'right' ? 'align-right' : ''
                              }`}
                            >
                              {renderCellSafe(col, row, rIdx)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons at bottom */}
                      {actionCol && (
                        <div className="datatable-card-actions">
                          {renderCellSafe(actionCol, row, rIdx)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom Pagination Bar */}
      {effectiveCount > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={effectiveCount}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={typeof onPageSizeChange === 'function' ? onPageSizeChange : undefined}
        />
      )}
    </div>
  );
}
