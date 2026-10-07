/**
 * Hardware Fingerprint Generator for JDMatcher Enterprise
 * 
 * Generates a deterministic physical machine fingerprint using:
 * - GPU vendor & unmasked WebGL renderer
 * - 2D Canvas text & shape pixel rasterization
 * - CPU hardware concurrency (logical cores)
 * - System memory / RAM estimate
 * - Screen geometry & color depth
 * - System timezone
 * 
 * This ensures that multiple Chrome profiles on the same computer produce
 * the EXACT SAME machine identity, while different physical computers produce distinct IDs.
 */

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

let cachedFingerprint: string | null = null;

export async function generateHardwareFingerprint(): Promise<string> {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  // Check localStorage cache first for instant synchronous availability
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('jdmatcher_hw_fingerprint');
    if (stored && stored.startsWith('mach_')) {
      cachedFingerprint = stored;
      return stored;
    }
  }

  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return 'mach_ssr_default';
    }

    let canvasData = '';
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('JDMatcher_Fingerprint_2026', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('JDMatcher_Fingerprint_2026', 4, 17);
      canvasData = canvas.toDataURL();
    }

    let glVendor = '';
    let glRenderer = '';
    try {
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          glVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
          glRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        }
      }
    } catch (_e) {
      // Ignore WebGL disabled
    }

    const rawSpecs = [
      navigator.userAgent,
      navigator.hardwareConcurrency || '4',
      (navigator as any).deviceMemory || '8',
      screen.width || '1920',
      screen.height || '1080',
      screen.colorDepth || '24',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      canvasData,
      glVendor,
      glRenderer,
    ].join('###');

    let hashHex = '';
    if (window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(rawSpecs);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      hashHex = Math.abs(hashCode(rawSpecs)).toString(16).padStart(32, '0');
    }

    const finalFingerprint = 'mach_' + hashHex.slice(0, 32);
    cachedFingerprint = finalFingerprint;

    try {
      localStorage.setItem('jdmatcher_hw_fingerprint', finalFingerprint);
      localStorage.setItem('deviceId', finalFingerprint);
    } catch {
      // Ignore storage errors
    }

    return finalFingerprint;
  } catch (err) {
    console.warn('Hardware fingerprint fallback used:', err);
    const fallback = 'mach_fallback_' + Math.abs(hashCode(navigator.userAgent + screen.width + screen.height));
    cachedFingerprint = fallback;
    return fallback;
  }
}

/**
 * Synchronous getter: returns cached fingerprint or triggers async generation
 */
export function getHardwareFingerprintSync(): string {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('jdmatcher_hw_fingerprint') || localStorage.getItem('deviceId');
    if (stored && stored.startsWith('mach_')) {
      cachedFingerprint = stored;
      return stored;
    }
    // Generate asynchronously in background
    generateHardwareFingerprint();
  }
  return cachedFingerprint || 'mach_initializing';
}
