import React, { useState, useEffect, useCallback } from 'react';
import { getQrSettingApi, uploadQrSettingApi } from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import Loader from '../../components/common/Loader';
import ErrorState from '../../components/common/ErrorState';
import Button from '../../components/common/Button';
import { QrIcon, UploadIcon, CheckCircleIcon } from '../../components/common/Icons';
import { formatDateTime } from '../../utils/formatters';
import { TextInput, FileInput } from '../../components/forms';
import './AdminPages.css';

export default function AdminSettingsPage() {
  const { success, error: toastError } = useToast();

  const [currentSetting, setCurrentSetting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [title, setTitle] = useState('');
  const [upiId, setUpiId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getQrSettingApi();
      setCurrentSetting(res);
      setTitle(res?.title || 'FleetFlow Primary Payment QR');
      setUpiId(res?.upi_id || '');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load QR code settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile && !currentSetting?.qr_image) {
      setFileError('Please select a QR image to upload.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('qr_image', selectedFile);
      }
      formData.append('title', title);
      formData.append('upi_id', upiId);

      await uploadQrSettingApi(formData);
      success('Payment QR code updated successfully.');
      setSelectedFile(null);
      setPreviewUrl('');
      fetchSetting();
    } catch (err) {
      const errData = err?.response?.data;
      const msg = typeof errData === 'object' ? Object.values(errData).flat().join(', ') : errData;
      toastError(msg || 'Failed to upload QR image.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page-container fade-in">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Loader text="Loading payment configuration..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page-container fade-in">
        <ErrorState message={error} onRetry={fetchSetting} />
      </div>
    );
  }

  return (
    <div className="admin-page-container fade-in">
      <div className="admin-header-row">
        <div>
          <h1>Payment & Gateway Settings</h1>
          <p>Configure bank QR codes for customer UPI and manual payment clearance</p>
        </div>
      </div>

      <div className="admin-grid-2col">
        {/* Current Active QR Image Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Active Payment QR</h2>
              <span className="admin-card-subtitle">Displayed to customers during checkout</span>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-bold)',
                background: 'var(--status-green-bg)',
                color: 'var(--status-green-text)',
              }}
            >
              <CheckCircleIcon size={14} />
              ACTIVE
            </span>
          </div>

          <div className="qr-preview-container">
            {currentSetting?.qr_image_url || currentSetting?.qr_image ? (
              <img
                src={currentSetting.qr_image_url || currentSetting.qr_image}
                alt="Active Payment QR"
                className="qr-image-display"
              />
            ) : (
              <div style={{ padding: '40px', color: 'var(--color-text-muted)' }}>
                <QrIcon size={48} />
                <p>No active payment QR uploaded yet</p>
              </div>
            )}

            <div style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-base)' }}>
                {currentSetting?.title || 'FleetFlow Merchant QR'}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                UPI ID: <strong>{currentSetting?.upi_id || 'Not specified'}</strong>
              </div>
              {currentSetting?.updated_at && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Last updated: {formatDateTime(currentSetting.updated_at)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload / Replace QR Form */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Upload New QR Code</h2>
              <span className="admin-card-subtitle">PNG, JPG, WEBP • Max 2 MB</span>
            </div>
          </div>

          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TextInput
              label="QR Title / Merchant Name"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. FleetFlow Official Bank QR"
            />

            <TextInput
              label="Merchant UPI ID / VPA"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. payments@fleetflow or 9876543210@upi"
            />

            <FileInput
              label="QR Image File"
              accept="image/png, image/jpeg, image/jpg, image/webp"
              maxSizeMB={2}
              onChange={(file) => {
                setSelectedFile(file);
                if (file) {
                  setFileError('');
                  const objectUrl = URL.createObjectURL(file);
                  setPreviewUrl(objectUrl);
                } else {
                  setPreviewUrl('');
                }
              }}
              error={fileError}
              hint="Max file size 2 MB. Square aspect ratio recommended."
            />

            {previewUrl && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 'var(--space-4)',
                  background: 'var(--color-surface-hover, var(--bg))',
                  border: '1px dashed var(--color-primary, var(--primary))',
                  borderRadius: 'var(--radius-md, 8px)',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Selected File Preview
                </span>
                <img
                  src={previewUrl}
                  alt="Selected QR Preview"
                  style={{
                    maxWidth: '160px',
                    maxHeight: '160px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    background: 'var(--surface)',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}

            <div style={{ marginTop: 'var(--space-6)' }}>
              <Button
                type="submit"
                variant="primary"
                size="large"
                fullWidth
                loading={uploading}
                disabled={uploading}
                leftIcon={<UploadIcon size={18} />}
              >
                Update Payment QR
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
