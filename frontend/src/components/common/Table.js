import React from 'react';
import Pagination from './Pagination';
import './Table.css';

export default function Table({
  columns = [],
  data = [],
  keyField = 'id',
  loading = false,
  emptyMessage = 'No data available',
  pagination = null, // { page: 1, totalPages: 5, onPageChange: (p) => {}, count: 10, pageSize: 10 }
  className = '',
}) {
  return (
    <div className={`table-container ${className}`}>
      <div className="table-responsive">
        <table className="custom-table">
          <colgroup>
            {columns.map((col, idx) => (
              <col
                key={col.key || idx}
                style={{
                  width: col.width || (col.key === 'action' || col.title === 'Action' ? '120px' : undefined),
                  minWidth: col.minWidth,
                  maxWidth: col.maxWidth,
                }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((col, idx) => {
                const isAction = col.key === 'action' || col.title === 'Action';
                const textAlign = col.align || (isAction ? 'right' : 'left');
                return (
                  <th
                    key={col.key || idx}
                    style={{
                      width: col.width || (isAction ? '120px' : undefined),
                      textAlign,
                    }}
                    className={`table-th ${textAlign === 'right' ? 'align-right' : ''}`}
                  >
                    {col.title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Skeleton rows while loading
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={`skel-${rIdx}`} className="table-tr-skeleton">
                  {columns.map((col, cIdx) => (
                    <td key={`skel-c-${cIdx}`} className="table-td">
                      <div className="table-skeleton-bar" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="table-td-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => (
                <tr key={row[keyField] || rIdx} className="table-tr">
                  {columns.map((col, cIdx) => {
                    const isAction = col.key === 'action' || col.title === 'Action';
                    const textAlign = col.align || (isAction ? 'right' : 'left');
                    return (
                      <td
                        key={col.key || cIdx}
                        style={{ textAlign }}
                        className={`table-td ${textAlign === 'right' ? 'align-right' : ''}`}
                      >
                        {col.render ? col.render(row[col.key], row, rIdx) : row[col.key]}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (pagination.totalPages > 1 || (pagination.count !== undefined && pagination.count > 0)) && (
        <Pagination
          page={pagination.page || 1}
          pageSize={pagination.pageSize || 10}
          totalCount={pagination.count || data.length}
          totalPages={pagination.totalPages || Math.ceil((pagination.count || data.length) / (pagination.pageSize || 10))}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}
    </div>
  );
}
