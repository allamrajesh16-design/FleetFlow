import React, { useState, useRef } from 'react';
import FormField from './FormField';
import IconButton from '../common/IconButton';
import { CloseIcon } from '../common/Icons';
import './forms.css';

export default function FileInput({
  label,
  id,
  name,
  accept = 'image/*',
  maxSizeMB = 5,
  onChange,
  error: externalError,
  hint,
  helperText,
  required = false,
  disabled = false,
  className = '',
  style,
}) {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [internalError, setInternalError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputId = id || name || 'file-input';
  const effectiveError = externalError || internalError;

  const validateAndSetFile = (file) => {
    setInternalError('');
    if (!file) return;

    // Size validation
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setInternalError(`File size exceeds ${maxSizeMB}MB limit (file is ${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
      return;
    }

    // Type validation
    if (accept) {
      const allowedTypes = accept.split(',').map((t) => t.trim().toLowerCase());
      const fileExt = `.${file.name.split('.').pop().toLowerCase()}`;
      const mimeType = file.type.toLowerCase();

      const isMatch = allowedTypes.some((allowed) => {
        if (allowed === '*/*' || allowed === '*') return true;
        if (allowed.endsWith('/*')) {
          const baseMime = allowed.replace('/*', '');
          return mimeType.startsWith(baseMime);
        }
        if (allowed.startsWith('.')) {
          return fileExt === allowed;
        }
        return mimeType === allowed;
      });

      if (!isMatch) {
        setInternalError(`Invalid file format. Please upload ${accept}.`);
        return;
      }
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    if (onChange) {
      onChange(file);
    }
  };

  const handleNativeChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    validateAndSetFile(file);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setInternalError('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (onChange) {
      onChange(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <FormField
      label={label}
      id={fileInputId}
      required={required}
      hint={hint || `Max size: ${maxSizeMB}MB (${accept})`}
      helperText={helperText}
      error={effectiveError}
      className={className}
      style={style}
    >
      <div className="ff-file-wrapper">
        <input
          ref={inputRef}
          id={fileInputId}
          name={name}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={handleNativeChange}
          className="ff-file-native-hidden"
          tabIndex={-1}
        />

        {!selectedFile ? (
          <div
            className={`ff-file-dropzone ${isDragOver ? 'ff-dragover file-drop-dragging' : ''} ${
              disabled ? 'ff-disabled' : ''
            }`}
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              Click to upload or drag & drop
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Supported: {accept} (up to {maxSizeMB}MB)
            </span>
          </div>
        ) : (
          <div className="ff-file-preview-card">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="File preview"
                className="ff-file-preview-img"
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '48px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--blue-50)',
                  color: 'var(--primary)',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
            )}
            <div className="ff-file-preview-info">
              <div className="ff-file-preview-name">{selectedFile.name}</div>
              <div className="ff-file-preview-size">
                {formatFileSize(selectedFile.size)}
              </div>
            </div>
            {!disabled && (
              <IconButton
                icon={<CloseIcon size={16} />}
                onClick={handleRemove}
                title="Remove file"
                ariaLabel="Remove file"
                variant="ghost"
                shape="round"
                size="sm"
                className="ff-file-remove-btn"
              />
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}
