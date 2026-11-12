import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiList from '../../hooks/useApiList';
import {
  listDocumentsApi,
  getExpiringDocumentsApi,
  approveDocumentApi,
  rejectDocumentApi,
  deleteDocumentApi,
  updateDocumentApi,
  getDocumentDownloadUrl,
} from '../../api/documents';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import ExpiryBadge from '../../components/common/ExpiryBadge';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import DocumentPreviewModal from '../../components/common/DocumentPreviewModal';
import { downloadPrivateFile } from '../../utils/fileDownloader';
import {
  DocumentIcon,
  TrashIcon,
  DownloadIcon,
} from '../../components/common/Icons';
import {
  Select,
  Textarea,
  FileInput,
} from '../../components/forms';
import Input from '../../components/common/Input';
import { formatDate, formatDocType } from '../../utils/formatters';
import { VehiclePlate } from '../../components/common/SignatureDesign';
import './FuelExpensesDocuments.css';

const VEHICLE_DOC_TYPES = [
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'REGISTRATION_RC', label: 'Registration (RC)' },
  { value: 'POLLUTION_PUC', label: 'Pollution (PUC)' },
  { value: 'FITNESS', label: 'Fitness' },
  { value: 'ROAD_TAX', label: 'Road Tax' },
  { value: 'PERMIT', label: 'Permit' },
  { value: 'OTHER', label: 'Other' },
];

const DRIVER_DOC_TYPES = [
  { value: 'DRIVING_LICENSE', label: 'Driving License' },
  { value: 'ID_PROOF', label: 'ID Proof' },
  { value: 'MEDICAL_CERTIFICATE', label: 'Medical Certificate' },
  { value: 'OTHER', label: 'Other' },
];

export default function DocumentsManagementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState('ALL'); // ALL | PENDING | APPROVED | REJECTED

  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('ff_view_documents') || 'table'
  );

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('ff_view_documents', mode);
  };

  // Expiring alerts panel data (uses only APPROVED documents)
  const [expiringData, setExpiringData] = useState({
    expired_count: 0,
    expiring_soon_count: 0,
    urgent_items: [],
  });
  const [expiringLoading, setExpiringLoading] = useState(true);

  const fetchExpiring = useCallback(async () => {
    setExpiringLoading(true);
    try {
      const res = await getExpiringDocumentsApi();
      const items = res.results || (Array.isArray(res) ? res : []);
      const expired = items.filter((d) => d.expiry_status === 'EXPIRED').length;
      const warning = items.filter((d) => d.expiry_status === 'EXPIRING_SOON').length;
      setExpiringData({
        expired_count: expired,
        expiring_soon_count: warning,
        urgent_items: items.slice(0, 5),
      });
    } catch {
      // ignore
    } finally {
      setExpiringLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpiring();
  }, [fetchExpiring]);

  // Main Documents list hook
  const {
    data: documents,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    filters,
    setPage,
    setSearch,
    setFilter,
    refresh,
  } = useApiList({
    endpoint: '/documents/',
    fetchFn: listDocumentsApi,
    initialFilters: {
      review_status: activeTab === 'ALL' ? '' : activeTab,
    },
  });

  const handleTabChange = (t) => {
    setActiveTab(t);
    setFilter('review_status', t === 'ALL' ? '' : t);
  };

  // Modals & Action States
  const [activePreview, setActivePreview] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [rejectingDoc, setRejectingDoc] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Replace / Update Document State
  const [replacingDoc, setReplacingDoc] = useState(null);
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceDocNumber, setReplaceDocNumber] = useState('');
  const [replaceExpiryDate, setReplaceExpiryDate] = useState('');
  const [replaceNotes, setReplaceNotes] = useState('');
  const [replaceSubmitting, setReplaceSubmitting] = useState(false);

  const handleOpenReplace = (doc) => {
    setReplacingDoc(doc);
    setReplaceDocNumber(doc.document_number || '');
    setReplaceExpiryDate(doc.expiry_date || '');
    setReplaceNotes(doc.notes || '');
    setReplaceFile(null);
  };

  const handleReplaceSubmit = async (e) => {
    e.preventDefault();
    if (!replacingDoc) return;

    if (replacingDoc.doc_type !== 'PROFILE_PHOTO' && !replaceExpiryDate) {
      toast.error('Expiry date is required for this document type.');
      return;
    }

    setReplaceSubmitting(true);
    try {
      const formData = new FormData();
      if (replaceFile) {
        formData.append('file', replaceFile);
      }
      if (replaceDocNumber.trim()) {
        formData.append('document_number', replaceDocNumber.trim());
      }
      if (replaceExpiryDate) {
        formData.append('expiry_date', replaceExpiryDate);
      }
      if (replaceNotes.trim()) {
        formData.append('notes', replaceNotes.trim());
      }

      const updated = await updateDocumentApi(replacingDoc.id, formData);
      toast.success(`Document #${replacingDoc.id} (${formatDocType(replacingDoc.doc_type)}) updated successfully!`);
      setReplacingDoc(null);
      setReplaceFile(null);
      refresh();
      fetchExpiring();
      if (activePreview && activePreview.id === replacingDoc.id) {
        setActivePreview(updated);
      }
    } catch (err) {
      const errMsg = err?.response?.data?.detail || err?.response?.data?.file?.[0] || 'Failed to update document.';
      toast.error(errMsg);
    } finally {
      setReplaceSubmitting(false);
    }
  };

  const handleDownload = async (doc) => {
    const url = getDocumentDownloadUrl(doc.id);
    const targetName = doc.vehicle_registration || doc.driver_name || 'doc';
    const fileName = `${targetName}_${doc.doc_type}_${doc.document_number || doc.id}`;
    await downloadPrivateFile(url, fileName, (msg) => toast.error(msg));
  };

  const handleApprove = async (doc) => {
    setActionLoading(true);
    try {
      await approveDocumentApi(doc.id);
      toast.success(`Document #${doc.id} approved!`);
      refresh();
      fetchExpiring();
    } catch {
      toast.error('Failed to approve document.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    setActionLoading(true);
    try {
      await rejectDocumentApi(rejectingDoc.id, rejectionReason.trim());
      toast.success(`Document #${rejectingDoc.id} rejected.`);
      setRejectingDoc(null);
      setRejectionReason('');
      refresh();
      fetchExpiring();
    } catch {
      toast.error('Failed to reject document.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDoc) return;
    setActionLoading(true);
    try {
      await deleteDocumentApi(deletingDoc.id);
      toast.success('Document deleted.');
      setDeletingDoc(null);
      refresh();
      fetchExpiring();
    } catch {
      toast.error('Failed to delete document.');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Target',
      accessor: 'target',
      width: '22%',
      minWidth: '180px',
      render: (doc) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          {doc.vehicle_registration ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
              <VehiclePlate registrationNumber={doc.vehicle_registration} size="sm" />
              {doc.uploaded_by_name && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Uploaded by: {doc.uploaded_by_name}
                </div>
              )}
            </div>
          ) : (
            <div>
              <strong style={{ display: 'block', color: 'var(--color-text-primary)' }}>
                Driver: {doc.driver_name || 'Self'}
              </strong>
              {doc.uploaded_by_name && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Uploaded by: {doc.uploaded_by_name}
                </div>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: 'doc_type',
      width: '18%',
      minWidth: '150px',
      render: (doc) => (
        <div>
          <strong style={{ display: 'block', color: 'var(--color-text-primary)' }}>
            {formatDocType(doc.doc_type)}
          </strong>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            #{doc.document_number}
          </div>
        </div>
      ),
    },
    {
      header: 'Review Status',
      accessor: 'review_status',
      width: '14%',
      minWidth: '120px',
      render: (doc) => {
        const st = doc.review_status || 'PENDING';
        const color = st === 'APPROVED' ? 'var(--success)' : st === 'REJECTED' ? 'var(--danger)' : 'var(--warning)';
        return (
          <div style={{ whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color, fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
              {st}
            </span>
            {st === 'REJECTED' && doc.rejection_reason && (
              <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '2px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {doc.rejection_reason}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Expiry Date',
      accessor: 'expiry_date',
      width: '18%',
      minWidth: '160px',
      render: (doc) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600 }}>{formatDate(doc.expiry_date)}</span>
          <ExpiryBadge status={doc.expiry_status} daysLeft={doc.days_left} />
        </div>
      ),
    },
    {
      header: 'File',
      accessor: 'file',
      width: '12%',
      minWidth: '110px',
      render: (doc) => (
        <div style={{ display: 'flex', gap: '6px', whiteSpace: 'nowrap' }}>
          <Button
            size="small"
            variant="ghost"
            title="View Document"
            aria-label="View Document"
            onClick={() => setActivePreview(doc)}
          >
            <DocumentIcon size={16} /> View
          </Button>
          <Button
            size="small"
            variant="ghost"
            title="Download Document"
            aria-label="Download Document"
            onClick={() => handleDownload(doc)}
          >
            <DownloadIcon size={16} />
          </Button>
        </div>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      width: '20%',
      minWidth: '200px',
      render: (doc) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
          <Button
            size="small"
            variant="outline"
            title="Update / Replace Document"
            aria-label="Update / Replace Document"
            onClick={() => handleOpenReplace(doc)}
          >
            Replace
          </Button>
          {doc.review_status === 'PENDING' && (
            <>
              <Button
                size="small"
                variant="primary"
                onClick={() => handleApprove(doc)}
                disabled={actionLoading}
              >
                Approve
              </Button>
              <Button
                size="small"
                variant="outline"
                onClick={() => {
                  setRejectingDoc(doc);
                  setRejectionReason('');
                }}
                disabled={actionLoading}
              >
                Reject
              </Button>
            </>
          )}
          {isAdmin && (
            <IconButton
              size="small"
              variant="danger"
              title="Delete Document"
              onClick={() => setDeletingDoc(doc)}
            >
              <TrashIcon size={16} />
            </IconButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <ErrorBoundary>
      <div className="ff-page-container">
        <PageHeader
          title="Document Compliance & Review"
          subtitle="Review driver licenses and uploaded vehicle compliance records"
        />

        {/* Top Expiring Panel (Approved docs only) */}
        <div className="ff-expiring-panel">
          <div className="ff-expiring-counts">
            <div className="ff-expiring-stat-box expired">
              <span className="ff-expiring-num">{expiringData.expired_count}</span>
              <span className="ff-expiring-lbl">Expired Documents</span>
            </div>
            <div className="ff-expiring-stat-box warning">
              <span className="ff-expiring-num">{expiringData.expiring_soon_count}</span>
              <span className="ff-expiring-lbl">Expiring in 30 Days</span>
            </div>
          </div>

          <div className="ff-expiring-urgent">
            <h4 className="ff-expiring-urgent-title">
              Approved Compliance Alerts (Next 5 Documents)
            </h4>
            {expiringLoading ? (
              <div style={{ padding: '8px 0', color: 'var(--color-text-muted)' }}>
                Checking compliance deadlines...
              </div>
            ) : expiringData.urgent_items.length === 0 ? (
              <div style={{ padding: '8px 0', color: 'var(--success-text)', fontWeight: 500 }}>
                ✓ All vehicle and driver documents are valid and up to date!
              </div>
            ) : (
              <div className="ff-urgent-list">
                {expiringData.urgent_items.map((item) => (
                  <div key={item.id} className="ff-urgent-item">
                    <div className="ff-urgent-owner">
                      <strong>{item.entity_name || item.target || item.document_number}</strong>
                      <span className="ff-urgent-type">
                        {formatDocType(item.doc_type_display || item.doc_type)}
                      </span>
                    </div>
                    <ExpiryBadge status={item.expiry_status} daysLeft={item.days_left} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs: ALL, PENDING, APPROVED, REJECTED */}
        <div className="ff-tabs-bar" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((t) => (
            <Button
              key={t}
              type="button"
              variant={activeTab === t ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => handleTabChange(t)}
            >
              {t === 'ALL' ? 'All Documents' : t.charAt(0) + t.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="ff-filters-bar">
          <div className="ff-filters-left">
            <Select
              id="filter-doc-type"
              value={filters.doc_type || ''}
              onChange={(e) => setFilter('doc_type', e.target.value)}
              placeholder="All Document Types"
            >
              <option value="">All Document Types</option>
              {[...VEHICLE_DOC_TYPES, ...DRIVER_DOC_TYPES].map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>

            <Select
              id="filter-expiry-status"
              value={filters.expiry_status || ''}
              onChange={(e) => setFilter('expiry_status', e.target.value)}
              placeholder="All Expiry Statuses"
            >
              <option value="">All Expiry Statuses</option>
              <option value="EXPIRED">Expired</option>
              <option value="EXPIRING_SOON">Expiring Soon (30 Days)</option>
              <option value="VALID">Valid</option>
            </Select>
          </div>

          <div className="ff-filters-right">
            <ViewSwitch viewMode={viewMode} onChange={handleViewModeChange} />
          </div>
        </div>

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={documents}
          loading={loading}
          error={error}
          onRetry={refresh}
          searchPlaceholder="Search document number or owner..."
          searchValue={search}
          onSearchChange={setSearch}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          viewMode={viewMode}
          emptyTitle="No documents found"
          emptyDescription="Documents uploaded by drivers will appear here for verification and approval."
        />

        {/* Update / Replace Document FormModal */}
        <FormModal
          isOpen={Boolean(replacingDoc)}
          title={`Update / Replace Document #${replacingDoc?.id}`}
          onClose={() => setReplacingDoc(null)}
          onSubmit={handleReplaceSubmit}
          submitLabel={replaceSubmitting ? 'Updating Document...' : 'Save & Update Document'}
          submitting={replaceSubmitting}
        >
          {replacingDoc && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'var(--color-surface-hover, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)', padding: '12px 14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {formatDocType(replacingDoc.doc_type)} for {replacingDoc.vehicle_registration ? `Vehicle: ${replacingDoc.vehicle_registration}` : `Driver: ${replacingDoc.driver_name || 'Driver'}`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Select a replacement file (PDF or Image) and update the expiry date. The existing compliance record will be updated.
                </div>
              </div>

              <FileInput
                label="New Document File (PDF, PNG, JPG)"
                accept="application/pdf,image/png,image/jpeg,image/jpg"
                maxSizeMB={10}
                onChange={(file) => setReplaceFile(file)}
                helperText="Upload official renewal copy or replacement scan (Max 10MB)"
              />

              <Input
                label="Document Number"
                value={replaceDocNumber}
                onChange={(e) => setReplaceDocNumber(e.target.value)}
                placeholder="e.g. DL-9876543210 or POL-449102"
              />

              {replacingDoc.doc_type !== 'PROFILE_PHOTO' && (
                <Input
                  label="Expiry Date *"
                  type="date"
                  required
                  value={replaceExpiryDate}
                  onChange={(e) => setReplaceExpiryDate(e.target.value)}
                  helperText="New expiry date from renewed certificate"
                />
              )}

              <Textarea
                label="Update Notes / Reason (Optional)"
                rows={2}
                value={replaceNotes}
                onChange={(e) => setReplaceNotes(e.target.value)}
                placeholder="e.g. Annual insurance policy renewal completed"
              />
            </div>
          )}
        </FormModal>

        {/* Reject Dialog */}
        <FormModal
          isOpen={Boolean(rejectingDoc)}
          title={`Reject Document #${rejectingDoc?.id}`}
          onClose={() => setRejectingDoc(null)}
          onSubmit={handleRejectSubmit}
          submitLabel={actionLoading ? 'Rejecting...' : 'Reject Document'}
          submitting={actionLoading}
        >
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
            Please state why this document is rejected (e.g. illegible copy, expired certificate, mismatched name).
            The driver will receive a notification.
          </p>
          <Textarea
            label="Rejection Reason"
            required
            rows={3}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Enter clear reason for rejection..."
          />
        </FormModal>

        {/* Delete Dialog */}
        {isAdmin && (
          <ConfirmDialog
            isOpen={Boolean(deletingDoc)}
            title="Delete Document"
            message={`Are you sure you want to delete document #${deletingDoc?.id}? This action cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeletingDoc(null)}
          />
        )}

        {/* Document Preview Modal */}
        {activePreview && (
          <DocumentPreviewModal
            isOpen={Boolean(activePreview)}
            onClose={() => setActivePreview(null)}
            document={activePreview}
            downloadUrl={getDocumentDownloadUrl(activePreview.id)}
            onReplace={handleOpenReplace}
            onDownload={handleDownload}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
