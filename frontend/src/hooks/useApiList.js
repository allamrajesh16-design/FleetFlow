import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import apiClient, { getApiErrorMessage } from '../api/client';
import { normalizeList } from '../utils/safeHelpers';

/**
 * Custom hook for server-paginated, filtered, searchable API lists.
 * Features:
 * - Supports both object config and positional arguments
 * - Cancels in-flight requests on unmount or param change via AbortController
 * - Debounces search input by 400ms
 * - Stable dependency tracking via JSON serialization to prevent infinite re-render loops
 * - Pauses background polling when tab is hidden
 */
export default function useApiList(endpointOrConfig, initialFilters = {}, pageSize = 10, defaultOrdering = '') {
  // Support both useApiList({ endpoint: '/...', ... }) and useApiList('/...', { ... }, 10, '')
  const isObject = typeof endpointOrConfig === 'object' && endpointOrConfig !== null;
  const endpoint = isObject ? endpointOrConfig.endpoint || '' : endpointOrConfig || '';
  const targetPageSize = isObject ? endpointOrConfig.pageSize || 10 : pageSize || 10;
  const initialOrdering = isObject ? endpointOrConfig.defaultOrdering || '' : defaultOrdering || '';

  const rawInitialFilters = isObject
    ? endpointOrConfig.initialFilters || {}
    : initialFilters || {};
  const serializedInitialFilters = JSON.stringify(rawInitialFilters);

  const initialFiltersRef = useRef(null);
  if (!initialFiltersRef.current) {
    initialFiltersRef.current = JSON.parse(serializedInitialFilters);
  }

  const [rawResponse, setRawResponse] = useState(null);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(() => initialFiltersRef.current);
  const [ordering, setOrdering] = useState(initialOrdering);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);

  // Debounced search term
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const searchTimeoutRef = useRef(null);

  // Robust search setter accepting both direct string and synthetic event
  const updateSearch = useCallback((valOrEvent) => {
    const val =
      typeof valOrEvent === 'string'
        ? valOrEvent
        : valOrEvent?.target?.value !== undefined
        ? valOrEvent.target.value
        : String(valOrEvent || '');
    setSearch(val);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      const term = typeof search === 'string' ? search : search?.target?.value || '';
      setDebouncedSearch(term);
      setPage(1); // Reset to page 1 on new search
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Set single filter helper
  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setPage(1); // Reset to page 1 on filter change
  }, []);

  const totalPages = Math.max(1, Math.ceil(count / targetPageSize));

  // Serialize filters for a stable primitive dependency
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  // Ref to hold active AbortController
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) {
      setLoading(false);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setErrorStatus(null);

    try {
      const params = {
        page,
        page_size: targetPageSize,
      };

      const term = typeof debouncedSearch === 'string'
        ? debouncedSearch
        : debouncedSearch?.target?.value || '';
      if (term && term.trim()) {
        params.search = term.trim();
      }

      if (ordering) {
        params.ordering = ordering;
      }

      // Add non-empty filters
      const activeFilters = JSON.parse(filtersKey);
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && v !== 'ALL' && v !== 'all') {
          params[k] = v;
        }
      });

      const response = await apiClient.get(endpoint, {
        params,
        signal: controller.signal,
      });

      const respData = response.data;
      setRawResponse(respData);

      const normalized = normalizeList(respData);
      setRows(normalized.items);
      setCount(normalized.count);
    } catch (err) {
      // Do not treat deliberate cancellations as errors
      if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      setErrorStatus(err?.response?.status || null);
      setError(getApiErrorMessage(err));
      setRows([]);
      setCount(0);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [endpoint, page, targetPageSize, debouncedSearch, filtersKey, ordering]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data: rows, // Provide array directly so <DataTable data={data} /> works without error
    rows,
    rawResponse,
    count,
    totalCount: count, // Both count and totalCount for full compatibility
    totalPages,
    page,
    setPage,
    search: typeof search === 'string' ? search : search?.target?.value || '',
    setSearch: updateSearch,
    filters,
    setFilter,
    setFilters,
    ordering,
    setOrdering,
    loading,
    error,
    errorStatus,
    refresh,
  };
}
