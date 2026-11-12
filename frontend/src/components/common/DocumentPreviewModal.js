import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from './Modal';
import Button from './Button';
import Loader from './Loader';
import ExpiryBadge from './ExpiryBadge';
import { DownloadIcon, RefreshIcon } from './Icons';
import { fetchPrivateFileBlobUrl, downloadPrivateFile } from '../../utils/fileDownloader';
import { formatDocType, formatDate } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';
import './DocumentPreviewModal.css';

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  document: doc,
  downloadUrl,
  onReplace,
  onDownload,
}) {
  const { error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [displayError, setDisplayError] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);
  const fileDataRef = useRef(null);
  fileDataRef.current = fileData;

  const loadPreview = useCallback(async (activeRef) => {
    if (!downloadUrl) return;
    setLoading(true);
    setErrorInfo(null);
    setDisplayError(false);
    setFileData(null);

    try {
      // Append inline=true so backend serves it for in-browser rendering
      const inlineUrl = downloadUrl.includes('?') ? `${downloadUrl}&inline=true` : `${downloadUrl}?inline=true`;
      const res = await fetchPrivateFileBlobUrl(inlineUrl, toastError);
      if (!activeRef.current) {
        if (res?.revoke) res.revoke();
        return;
      }
      if (res && !res.error) {
        setFileData(res);
        if (!res.isPdf && !res.isImage) {
          setDisplayError(true);
        }
      } else {
        setErrorInfo(res || { error: true, status: 500, errorMessage: 'Failed to load preview.' });
      }
    } catch {
      if (activeRef.current) {
        setErrorInfo({ error: true, status: 500, errorMessage: 'Failed to load preview.' });
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [downloadUrl, toastError]);

  useEffect(() => {
    const activeRef = { current: true };
    if (isOpen && downloadUrl) {
      loadPreview(activeRef);
    }

    return () => {
      activeRef.current = false;
      if (fileDataRef.current?.revoke) {
        fileDataRef.current.revoke();
      }
    };
  }, [isOpen, downloadUrl, retryCounter, loadPreview]);

  const handleClose = () => {
    if (fileData?.revoke) {
      fileData.revoke();
    }
    setFileData(null);
    setErrorInfo(null);
    setDisplayError(false);
    if (onClose) onClose();
  };

  const handleRetry = () => {
    setRetryCounter((c) => c + 1);
  };

  const handleDownloadClick = async () => {
    if (onDownload && doc) {
      onDownload(doc);
    } else if (downloadUrl) {
      const fileName = `doc_${doc?.id || Date.now()}`;
      await downloadPrivateFile(downloadUrl, fileName, toastError);
    }
  };

  if (!isOpen || !doc) return null;

  const targetName = doc.vehicle_registration
    ? `Vehicle: ${doc.vehicle_registration}`
    : `Driver: ${doc.driver_name || 'Driver'}`;

  const isUnsupported = !loading && !errorInfo && (displayError || (fileData && !fileData.isPdf && !fileData.isImage));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${formatDocType(doc.doc_type)} Preview`}
      maxWidth="780px"
      footer={
        <div className="doc-preview-footer">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
          <div className="doc-preview-footer-right">
            <Button
              variant="outline"
              onClick={handleDownloadClick}
              leftIcon={<DownloadIcon size={16} />}
            >
              Download
            </Button>
            {onReplace && (
              <Button
                variant="primary"
                onClick={() => {
                  handleClose();
                  onReplace(doc);
                }}
              >
                Replace / Update Document
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="doc-preview-modal-inner">
        {/* Document Metadata Bar */}
        <div className="doc-preview-modal-meta">
          <div className="doc-preview-meta-item">
            <span className="doc-preview-meta-label">Document Type</span>
            <span className="doc-preview-meta-value">{formatDocType(doc.doc_type)}</span>
          </div>

          <div className="doc-preview-meta-item">
            <span className="doc-preview-meta-label">Associated Record</span>
            <span className="doc-preview-meta-value">{targetName}</span>
          </div>

          <div className="doc-preview-meta-item">
            <span className="doc-preview-meta-label">Document Number</span>
            <span className="doc-preview-meta-value">{doc.document_number || 'N/A'}</span>
          </div>

          <div className="doc-preview-meta-item">
            <span className="doc-preview-meta-label">Upload Date</span>
            <span className="doc-preview-meta-value">{formatDate(doc.created_at)}</span>
          </div>

          <div className="doc-preview-meta-item">
            <span className="doc-preview-meta-label">Expiry Date</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="doc-preview-meta-value">{doc.expiry_date ? formatDate(doc.expiry_date) : 'No Expiry'}</span>
              {doc.expiry_date && (
                <ExpiryBadge status={doc.expiry_status} daysLeft={doc.days_left} />
              )}
            </div>
          </div>
        </div>

        {/* Document Preview Body */}
        <div className="doc-preview-body">
          {loading && (
            <div style={{ padding: '40px', color: '#fff' }}>
              <Loader text="Loading document preview..." />
            </div>
          )}

          {!loading && errorInfo && (
            <div style={{ textAlign: 'center', color: '#fff', padding: '30px' }}>
              <p style={{ marginBottom: '16px' }}>Unable to preview this document.</p>
              <Button variant="primary" onClick={handleRetry} leftIcon={<RefreshIcon size={16} />}>
                Retry Preview
              </Button>
            </div>
          )}

          {isUnsupported && (
            <div style={{ textAlign: 'center', color: '#fff', padding: '30px' }}>
              <p style={{ marginBottom: '16px' }}>Inline preview is not available for this file format.</p>
              <Button variant="primary" onClick={handleDownloadClick} leftIcon={<DownloadIcon size={16} />}>
                Download to View
              </Button>
            </div>
          )}

          {fileData && !loading && !errorInfo && !isUnsupported && (
            fileData.isPdf ? (
              <iframe
                src={fileData.blobUrl}
                title={`${formatDocType(doc.doc_type)} PDF`}
                className="doc-preview-iframe"
              />
            ) : (
              <div className="doc-preview-img-wrapper">
                <img
                  src={fileData.blobUrl}
                  alt={`${formatDocType(doc.doc_type)}`}
                  className="doc-preview-img"
                  onError={() => setDisplayError(true)}
                />
              </div>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}

