import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Loader from './Loader';
import { DownloadIcon } from './Icons';
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
  const [error, setError] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [displayError, setDisplayError] = useState(false);

  useEffect(() => {
    let active = true;
    let cleanupFn = null;

    if (isOpen && downloadUrl) {
      setLoading(true);
      setError(null);
      setDisplayError(false);
      setFileData(null);

      fetchPrivateFileBlobUrl(downloadUrl, toastError)
        .then((res) => {
          if (!active) {
            if (res?.revoke) res.revoke();
            return;
          }
          if (res) {
            setFileData(res);
            cleanupFn = res.revoke;
            if (!res.isPdf && !res.isImage) {
              setDisplayError(true);
            }
          } else {
            setError(true);
          }
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      if (cleanupFn) cleanupFn();
    };
  }, [isOpen, downloadUrl, toastError]);

  const handleClose = () => {
    if (fileData?.revoke) {
      fileData.revoke();
    }
    setFileData(null);
    if (onClose) onClose();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPrivateFile(downloadUrl, fileName, toastError);
    } finally {
      setDownloading(false);
    }
  };

  const showUnavailable = (error || displayError || (!loading && fileData && !fileData.isPdf && !fileData.isImage));

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

        {showUnavailable && !loading && (
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

        {fileData && !loading && !showUnavailable && (
          <div className="receipt-viewer-body">
            {fileData.isPdf ? (
              <object
                data={fileData.blobUrl}
                type="application/pdf"
                className="receipt-viewer-iframe"
                onError={() => setDisplayError(true)}
              >
                <iframe
                  src={fileData.blobUrl}
                  title={title}
                  className="receipt-viewer-iframe"
                  onError={() => setDisplayError(true)}
                >
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
                </iframe>
              </object>
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
