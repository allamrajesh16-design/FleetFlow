import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import useApiList from '../../hooks/useApiList';
import {
  listDocumentsApi,
  createDocumentApi,
  getMyTargetsApi,
  getDocumentDownloadUrl,
} from '../../api/documents';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import ExpiryBadge from '../../components/common/ExpiryBadge';
import FormModal from '../../components/common/FormModal';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import ReceiptViewer from '../../components/common/ReceiptViewer';
import { downloadPrivateFile } from '../../utils/fileDownloader';
import {
  DocumentIcon,
  DownloadIcon,
  PlusIcon,
} from '../../components/common/Icons';
import {
  Select,
  TextInput,
  DateInput,
  FileInput,
  Textarea,
} from '../../components/forms';
import { formatDate, formatDocType } from '../../utils/formatters';
import './DriverPages.css';
import '../shared/FuelExpensesDocuments.css';

export default function DriverDocumentsPage() {
  const toast = useToast();
  const [activePreview, setActivePreview] = useState(null);
  const targetSelectRef = useRef(null);

  // Targets: driver self and vehicles driven on trips
  const [targets, setTargets] = useState(null);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [targetType, setTargetType] = useState('DRIVER'); // DRIVER or vehicle id
  const [docType, setDocType] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const {
    data: documents,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    setPage,
    setSearch,
    refresh,
  } = useApiList({
    endpoint: '/documents/',
    fetchFn: listDocumentsApi,
  });

  const loadTargets = async () => {
    setLoadingTargets(true);
    try {
      const data = await getMyTargetsApi();
      setTargets(data);
    } catch {
      // ignore
    } finally {
      setLoadingTargets(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, []);

  const handleOpenUpload = () => {
    loadTargets();
    setTargetType('DRIVER');
    setDocType('DRIVING_LICENSE');
    setDocNumber('');
    setExpiryDate('');
    setIssueDate('');
    setNotes('');
    setFile(null);
    setFieldErrors({});
    setShowMoreDetails(false);
    setIsUploadOpen(true);
    setTimeout(() => {
      if (targetSelectRef.current) targetSelectRef.current.focus();
    }, 100);
  };

  const handleDownload = async (doc) => {
    const url = getDocumentDownloadUrl(doc.id);
    const fileName = `driver_doc_${doc.doc_type}_${doc.document_number || doc.id}`;
    await downloadPrivateFile(url, fileName, (msg) => toast.error(msg));
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!docNumber.trim()) {
      setFieldErrors({ document_number: 'Document number is required.' });
      return;
    }
    if (!expiryDate) {
      setFieldErrors({ expiry_date: 'Expiry date is required.' });
      return;
    }
    if (!file) {
      setFieldErrors({ file: 'Please select a document file to upload.' });
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const formData = new FormData();
      if (targetType === 'DRIVER') {
        formData.append('driver', targets?.driver?.id);
      } else {
        formData.append('vehicle', targetType);
      }
      formData.append('doc_type', docType);
      formData.append('document_number', docNumber.trim());
      formData.append('expiry_date', expiryDate);
      if (issueDate) formData.append('issue_date', issueDate);
      if (notes.trim()) formData.append('notes', notes.trim());
      formData.append('file', file);

      await createDocumentApi(formData);
      toast.success('Document uploaded! Sent to Admin & Fleet Manager for review.');
      setIsUploadOpen(false);
      refresh();
    } catch (err) {
      if (err.response?.data && typeof err.response.data === 'object') {
        const errors = {};
        for (const [k, v] of Object.entries(err.response.data)) {
          errors[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setFieldErrors(errors);
        if (errors.non_field_errors || errors.detail) {
          toast.error(errors.non_field_errors || errors.detail);
        }
      } else {
        toast.error('Failed to upload document.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Compute allowed doc types based on target
  const allowedDocTypes =
    targetType === 'DRIVER'
      ? targets?.driver?.allowed_doc_types || [
          { value: 'DRIVING_LICENSE', label: 'Driving License' },
          { value: 'ID_PROOF', label: 'ID Proof' },
          { value: 'MEDICAL_CERTIFICATE', label: 'Medical Certificate' },
          { value: 'OTHER', label: 'Other' },
        ]
      : targets?.vehicle_allowed_doc_types || [
          { value: 'INSURANCE', label: 'Insurance' },
          { value: 'REGISTRATION_RC', label: 'Registration (RC)' },
          { value: 'POLLUTION_PUC', label: 'Pollution (PUC)' },
          { value: 'FITNESS', label: 'Fitness' },
          { value: 'ROAD_TAX', label: 'Road Tax' },
          { value: 'PERMIT', label: 'Permit' },
          { value: 'OTHER', label: 'Other' },
        ];

  const columns = [
    {
      key: 'target',
      label: 'Document For',
      header: 'Document For',
      minWidth: '200px',
      width: '24%',
      render: (doc) =>
        doc.vehicle_registration ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Vehicle</span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{doc.vehicle_registration}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Driver</span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>License / ID</span>
          </div>
        ),
    },
    {
      key: 'doc_type',
      label: 'Document Type',
      header: 'Document Type',
      minWidth: '190px',
      width: '22%',
      render: (doc) => (
        <div>
          <strong style={{ display: 'block', color: 'var(--text)' }}>
            {formatDocType(doc.doc_type_display || doc.doc_type)}
          </strong>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            #{doc.document_number}
          </div>
        </div>
      ),
    },
    {
      key: 'review_status',
      label: 'Review Status',
      header: 'Review Status',
      minWidth: '130px',
      width: '14%',
      render: (doc) => {
        const st = doc.review_status || 'PENDING';
        const color = st === 'APPROVED' ? 'var(--success)' : st === 'REJECTED' ? 'var(--danger)' : 'var(--warning)';
        return (
          <span style={{ fontWeight: 600, color, fontSize: 'var(--font-size-xs)' }}>
            {st}
          </span>
        );
      },
    },
    {
      key: 'expiry_date',
      label: 'Expiry Date',
      header: 'Expiry Date',
      minWidth: '180px',
      width: '20%',
      render: (doc) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            {formatDate(doc.expiry_date)}
          </span>
          <ExpiryBadge status={doc.expiry_status} daysLeft={doc.days_left} />
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      header: 'Actions',
      align: 'right',
      minWidth: '200px',
      width: '20%',
      render: (doc) => (
        <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center', whiteSpace: 'nowrap' }}>
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              setActivePreview({
                url: getDocumentDownloadUrl(doc.id),
                title: `${formatDocType(doc.doc_type_display || doc.doc_type)} - Preview`,
              })
            }
          >
            <DocumentIcon size={16} /> View
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => handleDownload(doc)}
          >
            <DownloadIcon size={16} /> Download
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ErrorBoundary>
      <div className="ff-page-container">
        <PageHeader
          title="My Documents & Compliance"
          subtitle="Upload and manage license and vehicle compliance records"
          actions={
            <Button variant="primary" onClick={handleOpenUpload}>
              <PlusIcon size={18} /> Upload Document
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={documents}
          loading={loading}
          error={error}
          onRetry={refresh}
          searchPlaceholder="Search document number..."
          searchValue={search}
          onSearchChange={setSearch}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyTitle="No documents registered"
          emptyDescription="Your driving license and uploaded vehicle records will appear here."
          emptyAction={
            <Button variant="primary" onClick={handleOpenUpload}>
              <PlusIcon size={16} /> Upload Document
            </Button>
          }
        />

        {/* Upload Document Modal */}
        <FormModal
          isOpen={isUploadOpen}
          title="Upload Document"
          onClose={() => setIsUploadOpen(false)}
          onSubmit={handleUploadSubmit}
          submitLabel={submitting ? 'Uploading...' : 'Submit Document'}
          submitting={submitting}
        >
          {/* 1. Document Target */}
          <Select
            ref={targetSelectRef}
            label={loadingTargets ? 'Document For (Loading...)' : 'Document For'}
            id="driver-doc-target"
            required
            disabled={loadingTargets}
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setDocType(e.target.value === 'DRIVER' ? 'DRIVING_LICENSE' : 'INSURANCE');
            }}
            options={[
              { value: 'DRIVER', label: `My Driver Profile (${targets?.driver?.name || 'Me'})` },
              ...(targets?.vehicles || []).map((v) => ({
                value: String(v.id),
                label: `Vehicle: ${v.registration_number} (${v.brand} ${v.model})`,
              })),
            ]}
          />

          {/* 2. Type */}
          <Select
            label="Document Type"
            id="driver-doc-type"
            required
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={allowedDocTypes}
          />

          {/* 3. Document Number */}
          <TextInput
            label="Document Number"
            id="driver-doc-number"
            required
            placeholder="e.g. DL-0420110012345 or POL-992381"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            error={fieldErrors.document_number}
          />

          {/* 4. Expiry Date */}
          <DateInput
            label="Expiry Date"
            id="driver-doc-expiry"
            required
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            error={fieldErrors.expiry_date}
          />

          {/* 5. Document File */}
          <FileInput
            label="Document File (PDF or Image, max 5MB)"
            id="driver-doc-file"
            required
            accept="image/*,application/pdf"
            maxSizeMB={5}
            onChange={(f) => setFile(f)}
            error={fieldErrors.file}
          />

          {/* Optional More Details */}
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowMoreDetails(!showMoreDetails)}
              style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
            >
              {showMoreDetails ? '▲ Hide extra details' : '▼ More details (Issue Date, Notes)'}
            </Button>

            {showMoreDetails && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <DateInput
                  label="Issue Date"
                  id="driver-doc-issue"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
                <Textarea
                  label="Notes / Comments"
                  id="driver-doc-notes"
                  placeholder="Optional notes regarding this document"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </div>
        </FormModal>

        {/* Authenticated Viewer */}
        {activePreview && (
          <ReceiptViewer
            isOpen={Boolean(activePreview)}
            onClose={() => setActivePreview(null)}
            downloadUrl={activePreview.url}
            title={activePreview.title}
            fileName={`driver_document_${Date.now()}`}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
