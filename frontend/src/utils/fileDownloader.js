import apiClient, { getErrorMessage } from '../api/client';

/**
 * Downloads a private file stored on the backend through an authenticated Axios request.
 * - Sends Bearer token automatically via apiClient.
 * - Handles images, PDFs, and binary files.
 * - Shows toast error or triggers custom toast event on failure (403, 404).
 * - Never appends token to URLs.
 * 
 * @param {string} url - API endpoint to download the file (e.g. '/fuel/1/download/')
 * @param {string} [fileName] - Optional filename for download attribute
 * @param {Function} [showToastError] - Optional toast error callback from useToast()
 */
function resolveContentType(rawType, url, disposition) {
  if (rawType && rawType !== 'application/octet-stream' && rawType !== 'binary/octet-stream') {
    return rawType;
  }
  let target = url || '';
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match && match[1]) target = match[1];
  }
  const clean = target.split('?')[0].toLowerCase();
  if (clean.endsWith('.pdf')) return 'application/pdf';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  return rawType || 'application/octet-stream';
}

/**
 * Downloads a private file stored on the backend through an authenticated Axios request.
 * - Sends Bearer token automatically via apiClient.
 * - Handles images, PDFs, and binary files.
 * - Shows toast error or triggers custom toast event on failure (403, 404).
 * - Never appends token to URLs.
 * 
 * @param {string} url - API endpoint to download the file (e.g. '/fuel/1/download/')
 * @param {string} [fileName] - Optional filename for download attribute
 * @param {Function} [showToastError] - Optional toast error callback from useToast()
 */
export async function downloadPrivateFile(url, fileName, showToastError) {
  if (!url) return;

  const notifyError = (msg) => {
    if (typeof showToastError === 'function') {
      showToastError(msg);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fleetflow_toast', {
          detail: { type: 'error', message: msg },
        })
      );
    }
  };

  try {
    const response = await apiClient.get(url, {
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'] || '';
    const rawType = response.headers['content-type'] || '';
    const contentType = resolveContentType(rawType, url, disposition);
    const blob = new Blob([response.data], { type: contentType });
    const blobUrl = window.URL.createObjectURL(blob);

    // If fileName is provided or it's not viewable inline, trigger file download
    const link = document.createElement('a');
    link.href = blobUrl;
    
    // Extract filename from Content-Disposition if not provided
    let finalFileName = fileName;
    if (!finalFileName) {
      if (disposition && disposition.includes('filename=')) {
        const matches = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (matches && matches[1]) {
          finalFileName = matches[1].replace(/['"]/g, '');
        }
      }
    }
    
    link.setAttribute('download', finalFileName || 'downloaded_file');
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);

    // Revoke object URL after delay
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 10000);

    return blobUrl;
  } catch (error) {
    const status = error.response?.status;
    if (status === 403) {
      notifyError('Access denied. You do not have permission to download this file.');
    } else if (status === 404) {
      notifyError('The requested file was not found on the server.');
    } else {
      notifyError(getErrorMessage(error) || 'Failed to download file.');
    }
    return null;
  }
}

/**
 * Fetches an authenticated file and returns a temporary blob URL for previewing in an <img> or <iframe>.
 * Caller should call revoke() when done or when component unmounts.
 */
export async function fetchPrivateFileBlobUrl(url, showToastError) {
  if (!url) return null;

  const notifyError = (msg) => {
    if (typeof showToastError === 'function') {
      showToastError(msg);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fleetflow_toast', {
          detail: { type: 'error', message: msg },
        })
      );
    }
  };

  try {
    const response = await apiClient.get(url, {
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'] || '';
    const rawType = response.headers['content-type'] || '';
    const contentType = resolveContentType(rawType, url, disposition);
    const blob = new Blob([response.data], { type: contentType });
    const blobUrl = window.URL.createObjectURL(blob);

    const isPdf = contentType.toLowerCase().includes('pdf');
    const isImage = contentType.toLowerCase().startsWith('image/');

    return {
      blobUrl,
      contentType,
      isImage,
      isPdf,
      size: blob.size,
      revoke: () => window.URL.revokeObjectURL(blobUrl),
    };
  } catch (error) {
    const status = error.response?.status;
    if (status === 403) {
      notifyError('Access denied. You do not have permission to view this file.');
    } else if (status === 404) {
      notifyError('File not found or has been removed.');
    } else {
      notifyError(getErrorMessage(error) || 'Failed to preview file.');
    }
    return null;
  }
}
