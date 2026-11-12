import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  listDocumentsApi,
  createDocumentApi,
  getMyTargetsApi,
  getDocumentDownloadUrl,
} from '../../api/documents';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import Modal from '../../components/common/Modal';
import { Skeleton } from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { downloadPrivateFile } from '../../utils/fileDownloader';
import {
  DocumentIcon,
  DownloadIcon,
  PlusIcon,
  CheckIcon,
  ClockIcon,
  AlertCircleIcon,
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

// Core Driver Document Categories configuration
const CORE_DOC_CATEGORIES = [
  {
    type: 'DRIVING_LICENSE',
    title: 'Driving Licence',
    subtitle: 'Commercial driver authorisation permit',
    description: 'Mandatory valid commercial license for operating assigned fleet vehicles.',
    requiresNumber: true,
    requiresExpiry: true,
    icon: '🪪',
  },
  {
    type: 'ID_PROOF',
    title: 'Identity Proof',
    subtitle: 'Aadhaar / Voter ID / Passport',
    description: 'Government-issued photo identification proof for background records.',
    requiresNumber: true,
    requiresExpiry: true,
    icon: '🛂',
  },
  {
    type: 'PROFILE_PHOTO',
    title: 'Driver Profile Photo',
    subtitle: 'Recent passport photograph',
    description: 'Clear headshot photo displayed to passengers during active dispatches.',
    requiresNumber: false,
    requiresExpiry: false,
    icon: '👤',
  },
  {
    type: 'POLICE_VERIFICATION',
    title: 'Police Verification Certificate',
    subtitle: 'Background clearance certificate',
    description: 'Official police background verification and criminal check clearance.',
    requiresNumber: true,
    requiresExpiry: true,
    icon: '🛡️',
  },
  {
    type: 'MEDICAL_CERTIFICATE',
    title: 'Medical Fitness Certificate',
    subtitle: 'Authorized physician fitness check',
    description: 'Physical & optical fitness declaration for commercial vehicle transit.',
    requiresNumber: true,
    requiresExpiry: true,
    icon: '🩺',
  },
];

export default function DriverDocumentsPage() {
  const toast = useToast();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targets, setTargets] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Upload / Replace Modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [targetType, setTargetType] = useState('DRIVER');
  const [docType, setDocType] = useState('DRIVING_LICENSE');
  const [docNumber, setDocNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Load Documents and Targets
  const fetchDocumentsData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [docsRes, targetsRes] = await Promise.all([
        listDocumentsApi({ page_size: 100 }),
        getMyTargetsApi().catch(() => null),
      ]);
      const list = Array.isArray(docsRes) ? docsRes : docsRes?.results || [];
      setDocuments(list);
      setTargets(targetsRes);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError('Unable to load your documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocumentsData();
  }, [fetchDocumentsData]);

  // Compute the most recent document for each document type
  const latestDocsByType = useMemo(() => {
    const map = {};
    for (const doc of documents) {
      // If doc is for driver or vehicle, group driver docs
      if (!doc.vehicle) {
        const existing = map[doc.doc_type];
        if (!existing || new Date(doc.created_at) > new Date(existing.created_at)) {
          map[doc.doc_type] = doc;
        }
      }
    }
    return map;
  }, [documents]);

  // Document Summary Metrics
  const summaryMetrics = useMemo(() => {
    let verifiedCount = 0;
    let pendingCount = 0;
    let actionNeededCount = 0;

    CORE_DOC_CATEGORIES.forEach((cat) => {
      const doc = latestDocsByType[cat.type];
      if (!doc) {
        actionNeededCount += 1; // Not uploaded
      } else if (doc.review_status === 'REJECTED') {
        actionNeededCount += 1;
      } else if (doc.review_status === 'APPROVED') {
        if (doc.expiry_status === 'EXPIRED' || doc.expiry_status === 'EXPIRING_SOON') {
          actionNeededCount += 1;
        } else {
          verifiedCount += 1;
        }
      } else {
        pendingCount += 1;
      }
    });

    return {
      total: CORE_DOC_CATEGORIES.length,
      verified: verifiedCount,
      pending: pendingCount,
      actionNeeded: actionNeededCount,
    };
  }, [latestDocsByType]);

  // Open Modal to Upload or Replace a specific document type
  const handleOpenUploadForType = (type) => {
    setTargetType('DRIVER');
    setDocType(type || 'DRIVING_LICENSE');
    setDocNumber('');
    setIssueDate('');
    setExpiryDate('');
    setNotes('');
    setFile(null);
    setFieldErrors({});
    setIsUploadOpen(true);
  };

  // Secure download
  const handleDownload = async (doc) => {
    if (!doc?.id) return;
    setDownloadingId(doc.id);
    try {
      const url = getDocumentDownloadUrl(doc.id);
      const fileName = `driver_doc_${doc.doc_type}_${doc.document_number || doc.id}`;
      await downloadPrivateFile(url, fileName, (msg) => toast.error(msg));
    } catch {
      toast.error('Failed to download document file.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Form Submission
  const handleUploadSubmit = async (e) => {
    e?.preventDefault();
    const isProfilePhoto = docType === 'PROFILE_PHOTO';
    const errors = {};

    if (!isProfilePhoto && !docNumber.trim()) {
      errors.document_number = 'Document number is required.';
    }
    if (!isProfilePhoto && !expiryDate) {
      errors.expiry_date = 'Expiry date is required for this document.';
    }
    if (!file) {
      errors.file = 'Please select a document file to upload (PDF, JPG, or PNG).';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const formData = new FormData();
      if (targetType === 'DRIVER') {
        if (targets?.driver?.id) formData.append('driver', targets.driver.id);
      } else {
        formData.append('vehicle', targetType);
      }

      formData.append('doc_type', docType);
      formData.append('document_number', isProfilePhoto ? 'PHOTO' : docNumber.trim());
      if (expiryDate) formData.append('expiry_date', expiryDate);
      if (issueDate) formData.append('issue_date', issueDate);
      if (notes.trim()) formData.append('notes', notes.trim());
      formData.append('file', file);

      await createDocumentApi(formData);
      toast.success('Document uploaded successfully! Submitted for verification.');
      setIsUploadOpen(false);
      fetchDocumentsData();
    } catch (err) {
      const resp = err.response?.data;
      if (resp && typeof resp === 'object') {
        const errObj = {};
        for (const [k, v] of Object.entries(resp)) {
          errObj[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setFieldErrors(errObj);
        toast.error(errObj.detail || errObj.non_field_errors || 'Failed to submit document.');
      } else {
        toast.error('Failed to upload document.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to render Category Card Status Badge
  const renderCategoryStatusBadge = (doc, cat) => {
    if (!doc) {
      return (
        <span className="driver-doc-status-badge not-uploaded">
          Not Uploaded
        </span>
      );
    }

    if (doc.review_status === 'REJECTED') {
      return (
        <span className="driver-doc-status-badge rejected">
          ✕ Rejected
        </span>
      );
    }

    if (doc.review_status === 'PENDING') {
      return (
        <span className="driver-doc-status-badge pending">
          ⏳ Pending Review
        </span>
      );
    }

    // Approved / Verified status
    if (cat.requiresExpiry && doc.expiry_status === 'EXPIRED') {
      return (
        <span className="driver-doc-status-badge expired">
          ⚠️ Expired
        </span>
      );
    }

    if (cat.requiresExpiry && doc.expiry_status === 'EXPIRING_SOON') {
      return (
        <span className="driver-doc-status-badge expiring">
          ⏰ Expiring in {doc.days_left}d
        </span>
      );
    }

    return (
      <span className="driver-doc-status-badge verified">
        ✓ Verified
      </span>
    );
  };

  return (
    <div className="driver-page driver-documents-page fade-in">
      {/* 1. Page Header */}
      <div className="driver-page-header">
        <div>
          <h1 className="driver-page-title">Document Management</h1>
          <p className="driver-page-subtitle">
            Upload and track verification of your driver credentials and compliance certificates
          </p>
        </div>
        <div>
          <Button
            variant="primary"
            size="medium"
            icon={<PlusIcon size={18} />}
            onClick={() => handleOpenUploadForType('DRIVING_LICENSE')}
          >
            Upload Document
          </Button>
        </div>
      </div>

      {/* 2. Compliance Summary KPI Cards */}
      <div className="driver-doc-kpis-grid">
        <div className="driver-doc-kpi-card total">
          <div className="driver-doc-kpi-icon-wrap">
            <DocumentIcon size={22} />
          </div>
          <div className="driver-doc-kpi-content">
            <span className="driver-doc-kpi-num">{summaryMetrics.total}</span>
            <span className="driver-doc-kpi-lbl">Required Documents</span>
          </div>
        </div>

        <div className="driver-doc-kpi-card verified">
          <div className="driver-doc-kpi-icon-wrap verified">
            <CheckIcon size={22} />
          </div>
          <div className="driver-doc-kpi-content">
            <span className="driver-doc-kpi-num verified">{summaryMetrics.verified}</span>
            <span className="driver-doc-kpi-lbl">Verified & Active</span>
          </div>
        </div>

        <div className="driver-doc-kpi-card pending">
          <div className="driver-doc-kpi-icon-wrap pending">
            <ClockIcon size={22} />
          </div>
          <div className="driver-doc-kpi-content">
            <span className="driver-doc-kpi-num pending">{summaryMetrics.pending}</span>
            <span className="driver-doc-kpi-lbl">Pending Review</span>
          </div>
        </div>

        <div className="driver-doc-kpi-card action">
          <div className="driver-doc-kpi-icon-wrap action">
            <AlertCircleIcon size={22} />
          </div>
          <div className="driver-doc-kpi-content">
            <span className="driver-doc-kpi-num action">{summaryMetrics.actionNeeded}</span>
            <span className="driver-doc-kpi-lbl">Action Required</span>
          </div>
        </div>
      </div>

      {/* 3. Core Document Cards Grid */}
      <div className="driver-doc-section-header">
        <h2 className="driver-section-heading">Core Compliance Documents</h2>
        <span className="driver-section-sub">
          All drivers must maintain up-to-date documentation to receive trip assignments.
        </span>
      </div>

      {loading ? (
        <div className="driver-doc-cards-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height="200px" borderRadius="12px" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchDocumentsData} />
      ) : (
        <div className="driver-doc-cards-grid">
          {CORE_DOC_CATEGORIES.map((cat) => {
            const doc = latestDocsByType[cat.type];
            const isRejected = doc?.review_status === 'REJECTED';
            const isExpiringSoon = cat.requiresExpiry && doc?.expiry_status === 'EXPIRING_SOON';
            const isExpired = cat.requiresExpiry && doc?.expiry_status === 'EXPIRED';

            return (
              <Card
                key={cat.type}
                className={`driver-doc-category-card ${isRejected ? 'is-rejected' : isExpired ? 'is-expired' : isExpiringSoon ? 'is-expiring' : ''}`}
              >
                {/* Top Row: Icon & Status Badge */}
                <div className="driver-doc-card-top">
                  <div className="driver-doc-cat-identity">
                    <span className="driver-doc-emoji" aria-hidden="true">
                      {cat.icon}
                    </span>
                    <div>
                      <h3 className="driver-doc-cat-title">{cat.title}</h3>
                      <span className="driver-doc-cat-subtitle">{cat.subtitle}</span>
                    </div>
                  </div>
                  <div>{renderCategoryStatusBadge(doc, cat)}</div>
                </div>

                {/* Description */}
                <p className="driver-doc-cat-desc">{cat.description}</p>

                {/* Document Metadata Details Box */}
                {doc ? (
                  <div className="driver-doc-meta-box">
                    {cat.requiresNumber && (
                      <div className="driver-doc-meta-row">
                        <span className="driver-doc-meta-key">Doc Number:</span>
                        <strong className="driver-doc-meta-val">{doc.document_number || '—'}</strong>
                      </div>
                    )}

                    {doc.issue_date && (
                      <div className="driver-doc-meta-row">
                        <span className="driver-doc-meta-key">Issue Date:</span>
                        <span className="driver-doc-meta-val">{formatDate(doc.issue_date)}</span>
                      </div>
                    )}

                    {cat.requiresExpiry ? (
                      <div className="driver-doc-meta-row">
                        <span className="driver-doc-meta-key">Expiry Date:</span>
                        <span className="driver-doc-meta-val">
                          {formatDate(doc.expiry_date)}
                          {doc.days_left !== null && doc.days_left !== undefined && (
                            <span
                              className={`driver-doc-days-tag ${
                                doc.days_left <= 0 ? 'expired' : doc.days_left <= 30 ? 'warning' : 'ok'
                              }`}
                            >
                              ({doc.days_left <= 0 ? 'Expired' : `${doc.days_left}d remaining`})
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="driver-doc-meta-row">
                        <span className="driver-doc-meta-key">Validity:</span>
                        <span className="driver-doc-meta-val text-success">Permanent / Active</span>
                      </div>
                    )}

                    {doc.reviewed_at && doc.review_status === 'APPROVED' && (
                      <div className="driver-doc-meta-row verified-note">
                        <span className="driver-doc-meta-key">Verified on:</span>
                        <span className="driver-doc-meta-val">{formatDate(doc.reviewed_at)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="driver-doc-meta-empty">
                    <span className="empty-hint">No file uploaded yet. Upload to verify.</span>
                  </div>
                )}

                {/* Rejection Alert Box */}
                {isRejected && (
                  <div className="driver-doc-alert-banner rejected">
                    <strong>Rejection Reason:</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                      {doc.rejection_reason || 'Document verification was rejected. Please upload a clear and valid copy.'}
                    </p>
                  </div>
                )}

                {/* Expiry Alert Box */}
                {isExpiringSoon && (
                  <div className="driver-doc-alert-banner warning">
                    <strong>Expiry Alert:</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                      This document expires in {doc.days_left} days. Please upload a renewed document before expiration.
                    </p>
                  </div>
                )}

                {isExpired && (
                  <div className="driver-doc-alert-banner expired">
                    <strong>Document Expired:</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                      This document expired on {formatDate(doc.expiry_date)}. You cannot be assigned trips until renewed.
                    </p>
                  </div>
                )}

                {/* Card Actions */}
                <div className="driver-doc-card-actions">
                  {doc ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="small"
                        icon={<DownloadIcon size={15} />}
                        disabled={downloadingId === doc.id}
                        onClick={() => handleDownload(doc)}
                      >
                        {downloadingId === doc.id ? 'Downloading...' : 'View / Download'}
                      </Button>
                      {/* Only allow replace/renew when doc is rejected, expired, or expiring soon */}
                      {(isRejected || isExpired || isExpiringSoon) && (
                        <Button
                          type="button"
                          variant={isRejected || isExpired ? 'primary' : 'secondary'}
                          size="small"
                          onClick={() => handleOpenUploadForType(cat.type)}
                        >
                          {isRejected ? 'Re-upload' : 'Replace / Renew'}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="small"
                      fullWidth
                      icon={<PlusIcon size={15} />}
                      onClick={() => handleOpenUploadForType(cat.type)}
                    >
                      Upload Now
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 4. Complete Documents History Table */}
      <div className="driver-doc-history-section" style={{ marginTop: '36px' }}>
        <div className="driver-doc-section-header">
          <h2 className="driver-section-heading">Document Upload History</h2>
          <span className="driver-section-sub">
            All submitted files, audit records, and verification outcomes
          </span>
        </div>

        <Card className="driver-history-table-card">
          {documents.length === 0 ? (
            <EmptyState
              title="No documents recorded"
              description="Upload your compliance documents to start receiving vehicle assignments."
              actionText="Upload First Document"
              onAction={() => handleOpenUploadForType('DRIVING_LICENSE')}
            />
          ) : (
            <div className="driver-table-responsive-wrapper">
              <table className="driver-history-table">
                <thead>
                  <tr>
                    <th>Doc Type</th>
                    <th>Document No.</th>
                    <th>Issue Date</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th>Submitted On</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{formatDocType(d.doc_type)}</strong>
                        {d.vehicle_registration && (
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #64748b)' }}>
                            Vehicle: {d.vehicle_registration}
                          </div>
                        )}
                      </td>
                      <td>{d.document_number || '—'}</td>
                      <td>{d.issue_date ? formatDate(d.issue_date) : '—'}</td>
                      <td>
                        {d.expiry_date ? (
                          <>
                            {formatDate(d.expiry_date)}
                            {d.days_left !== null && d.days_left !== undefined && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginLeft: '6px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: d.days_left <= 0 ? 'var(--danger-text, #ef4444)' : 'inherit',
                                }}
                              >
                                {d.days_left <= 0 ? '(Expired)' : `(${d.days_left}d left)`}
                              </span>
                            )}
                          </>
                        ) : (
                          'No Expiry'
                        )}
                      </td>
                      <td>
                        {d.review_status === 'APPROVED' ? (
                          <Badge status="APPROVED" variant="success">Verified</Badge>
                        ) : d.review_status === 'REJECTED' ? (
                          <Badge status="REJECTED" variant="danger">Rejected</Badge>
                        ) : (
                          <Badge status="PENDING" variant="warning">Pending Review</Badge>
                        )}
                      </td>
                      <td>{formatDate(d.created_at)}</td>
                      <td>
                        <IconButton
                          size="small"
                          variant="ghost"
                          title="Download document file"
                          ariaLabel="Download document file"
                          disabled={downloadingId === d.id}
                          onClick={() => handleDownload(d)}
                        >
                          <DownloadIcon size={16} />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* 5. Upload / Replace Document Modal */}
      {isUploadOpen && (
        <Modal
          isOpen={true}
          onClose={() => !submitting && setIsUploadOpen(false)}
          title={`Upload ${CORE_DOC_CATEGORIES.find((c) => c.type === docType)?.title || 'Document'}`}
          maxWidth="560px"
          footer={
            <div className="driver-modal-actions">
              <Button
                variant="outline"
                size="medium"
                disabled={submitting}
                onClick={() => setIsUploadOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="medium"
                disabled={submitting}
                onClick={handleUploadSubmit}
              >
                {submitting ? 'Submitting...' : 'Submit for Verification'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleUploadSubmit} className="driver-doc-modal-form">
            <p className="driver-doc-modal-intro">
              Upload a clear PDF, JPG, or PNG document. Max file size: 5 MB. Documents are securely verified by fleet administrators.
            </p>

            {/* Document Type Selector */}
            <div className="form-group-item">
              <Select
                id="doc_type"
                label="Document Type *"
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value);
                  setFieldErrors({});
                }}
                options={
                  targets?.driver?.allowed_doc_types?.map((t) => ({
                    value: t.value,
                    label: t.label,
                  })) ||
                  CORE_DOC_CATEGORIES.map((c) => ({
                    value: c.type,
                    label: c.title,
                  }))
                }
                error={fieldErrors.doc_type}
              />
            </div>

            {/* Document Number (Hidden for Profile Photo) */}
            {docType !== 'PROFILE_PHOTO' && (
              <div className="form-group-item">
                <TextInput
                  id="document_number"
                  label="Document Number *"
                  placeholder="e.g. DL-1420110012345 or Aadhaar 1234 5678 9012"
                  value={docNumber}
                  onChange={(e) => {
                    setDocNumber(e.target.value);
                    if (fieldErrors.document_number) setFieldErrors({ ...fieldErrors, document_number: '' });
                  }}
                  error={fieldErrors.document_number}
                />
              </div>
            )}

            {/* Date Pickers */}
            <div className="driver-form-two-col-grid">
              <div className="form-group-item">
                <DateInput
                  id="issue_date"
                  label="Issue Date (Optional)"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  error={fieldErrors.issue_date}
                />
              </div>

              {docType !== 'PROFILE_PHOTO' ? (
                <div className="form-group-item">
                  <DateInput
                    id="expiry_date"
                    label="Expiry Date *"
                    required
                    value={expiryDate}
                    onChange={(e) => {
                      setExpiryDate(e.target.value);
                      if (fieldErrors.expiry_date) setFieldErrors({ ...fieldErrors, expiry_date: '' });
                    }}
                    error={fieldErrors.expiry_date}
                  />
                </div>
              ) : (
                <div className="form-group-item" style={{ display: 'flex', alignItems: 'center', paddingTop: '28px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-secondary, #64748b)' }}>
                    ✓ Profile photo does not expire.
                  </span>
                </div>
              )}
            </div>

            {/* File Upload Field */}
            <div className="form-group-item">
              <FileInput
                id="file"
                label="Upload Document File * (PDF, JPG, PNG up to 5MB)"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(fileOrEvent) => {
                  const selected =
                    fileOrEvent?.target?.files?.[0] ||
                    (fileOrEvent instanceof File ? fileOrEvent : (fileOrEvent?.name ? fileOrEvent : null));
                  setFile(selected);
                  if (fieldErrors.file) setFieldErrors({ ...fieldErrors, file: '' });
                }}
                error={fieldErrors.file}
                helperText="Ensure text, numbers, and photograph are clearly legible."
              />
            </div>

            {/* Notes Field */}
            <div className="form-group-item">
              <Textarea
                id="notes"
                label="Notes / Comments (Optional)"
                placeholder="Optional notes for the reviewing manager..."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
