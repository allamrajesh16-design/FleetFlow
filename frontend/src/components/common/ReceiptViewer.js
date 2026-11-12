import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from './Modal';
import Button from './Button';
import Loader from './Loader';
import { DownloadIcon, RefreshIcon } from './Icons';
import { fetchPrivateFileBlobUrl, downloadPrivateFile } from '../../utils/fileDownloader';
import { useToast } from '../../context/ToastContext';
import './ReceiptViewer.css';

/**
 * ReceiptViewer Component:
 * Previews an image or PDF document/receipt securely using authenticated blob fetch.
 * Features:
 * - Direct authenticated preview
 * - Download button for offline viewing
 * - Works on mobile and desktop
 */
export default function ReceiptViewer({
  isOpen,
  onClose,
  downloadUrl,
  title = 'Receipt Preview',
  fileName,
}) {
  const { error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [displayError, setDisplayError] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);
  const fileDataRef = useRef(null);
  fileDataRef.current = fileData;

  const loadPreview = useCallback(async (activeRef) => {
    setLoading(true);
    setErrorInfo(null);
    setDisplayError(false);
    setFileData(null);

    try {
      const res = await fetchPrivateFileBlobUrl(downloadUrl, toastError);
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
        setErrorInfo(res || { error: true, status: 500, errorMessage: 'Server problem. Please try again' });
      }
    } catch (err) {
      if (activeRef.current) {
        setErrorInfo({ error: true, status: 500, errorMessage: 'Server problem. Please try again' });
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPrivateFile(downloadUrl, fileName, toastError);
    } finally {
      setDownloading(false);
    }
  };

  const isUnsupported = !loading && !errorInfo && (displayError || (fileData && !fileData.isPdf && !fileData.isImage));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      maxWidth="680px"
      footer={
        <div className="receipt-viewer-footer">
          <Button
            variant="secondary"
            onClick={handleClose}
          >
            Close
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            loading={downloading}
            disabled={loading}
            leftIcon={<DownloadIcon size={16} />}
          >
            Download File
          </Button>
        </div>
      }
    >
      <div className="receipt-viewer-content">
        {loading && (
          <div className="receipt-viewer-loader">
            <Loader text="Loading preview..." />
          </div>
        )}

        {/* Specific error states: 401, 403, 404, 5xx */}
        {!loading && errorInfo && (
          <div className="receipt-viewer-unsupported">
            {errorInfo.status === 401 ? (
              <>
                <p className="receipt-viewer-unsupported-msg">Please login again.</p>
                <Button variant="primary" onClick={() => { window.location.href = '/login'; }}>
                  Go to Login
                </Button>
              </>
            ) : errorInfo.status === 403 ? (
              <p className="receipt-viewer-unsupported-msg">You are not allowed to open this file</p>
            ) : errorInfo.status === 404 ? (
              <p className="receipt-viewer-unsupported-msg">
                The file is missing on the server. Please contact your Fleet Manager
              </p>
            ) : (
              <>
                <p className="receipt-viewer-unsupported-msg">Server problem. Please try again</p>
                <Button
                  variant="primary"
                  onClick={handleRetry}
                  leftIcon={<RefreshIcon size={16} />}
                >
                  Retry
                </Button>
              </>
            )}
          </div>
        )}

        {/* Unsupported format */}
        {isUnsupported && (
          <div className="receipt-viewer-unsupported">
            <p className="receipt-viewer-unsupported-msg">Preview is not available. Please download the file.</p>
            <Button
              variant="primary"
              onClick={handleDownload}
              loading={downloading}
              leftIcon={<DownloadIcon size={16} />}
            >
              Download File
            </Button>
          </div>
        )}

        {fileData && !loading && !errorInfo && !isUnsupported && (
          <div className="receipt-viewer-body">
            {fileData.isPdf ? (
              <iframe
                src={fileData.blobUrl}
                title={title}
                className="receipt-viewer-iframe"
              />
            ) : (
              <div className="receipt-viewer-image-wrapper">
                <img
                  src={fileData.blobUrl}
                  alt={title}
                  className="receipt-viewer-image"
                  onError={() => setDisplayError(true)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
