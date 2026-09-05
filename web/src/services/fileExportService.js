import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Triggers a browser download via temporary anchor element with delayed URL revocation
 */
function downloadInBrowser(blob, filename) {
  if (typeof document === 'undefined') {
    return { success: true, filename, method: 'mock' };
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Delay revocation to ensure the browser has read the blob stream
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 5000);

  return { success: true, filename, method: 'browser_download' };
}

/**
 * Converts a Blob to a base64 encoded string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      } else {
        reject(new Error('Failed to read blob as base64 string'));
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Exports a text or JSON file across browser and Capacitor Android
 */
export async function exportTextFile({ filename, content, mimeType = 'application/json' }) {
  if (!content) {
    throw new Error('Content cannot be empty for file export.');
  }

  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // Write file into native app cache directory
      const textData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: textData,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      // Share file using native Android share sheet (allows saving to device, Drive, WhatsApp, etc.)
      try {
        await Share.share({
          title: filename,
          text: filename,
          url: writeResult.uri,
          dialogTitle: 'Save or share ' + filename,
        });
      } catch (shareErr) {
        // User cancelling the share sheet is not a fatal write error
        if (shareErr?.message && !shareErr.message.toLowerCase().includes('cancel')) {
          console.warn('Native share error:', shareErr);
        }
      }

      return {
        success: true,
        filename,
        uri: writeResult.uri,
        method: 'native_share',
      };
    } catch (err) {
      throw new Error(`Failed to save file on device: ${err.message}`);
    }
  }

  // Browser desktop fallback
  const textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const blob = new Blob([textContent], { type: mimeType });
  return downloadInBrowser(blob, filename);
}

/**
 * Exports an image file (e.g. from Canvas or Blob) across browser and Capacitor Android
 */
export async function exportImageFile({ filename, canvas, blob, mimeType = 'image/png' }) {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      let base64Data = '';
      if (canvas && typeof canvas.toDataURL === 'function') {
        const dataUrl = canvas.toDataURL(mimeType);
        base64Data = dataUrl.split(',')[1];
      } else if (blob) {
        base64Data = await blobToBase64(blob);
      } else {
        throw new Error('No canvas or blob provided for image export.');
      }

      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });

      try {
        await Share.share({
          title: filename,
          text: filename,
          url: writeResult.uri,
          dialogTitle: 'Save or share scorecard',
        });
      } catch (shareErr) {
        if (shareErr?.message && !shareErr.message.toLowerCase().includes('cancel')) {
          console.warn('Native share error:', shareErr);
        }
      }

      return {
        success: true,
        filename,
        uri: writeResult.uri,
        method: 'native_share',
      };
    } catch (err) {
      throw new Error(`Failed to save image on device: ${err.message}`);
    }
  }

  // Browser desktop fallback
  if (blob) {
    return downloadInBrowser(blob, filename);
  }

  if (canvas && typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) {
          reject(new Error('Failed to generate image blob from canvas.'));
          return;
        }
        resolve(downloadInBrowser(b, filename));
      }, mimeType);
    });
  }

  throw new Error('Canvas or Blob is required for browser image download.');
}
