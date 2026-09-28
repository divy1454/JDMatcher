/**
 * Generates a persistent machine hardware fingerprint matching the targeted algorithm.
 * Uses GPU render specs, 2D Canvas rasterization, CPU concurrency, screen geometry, and timezone.
 */
export async function generateHardwareFingerprint(): Promise<string> {
  try {
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
    } catch (_e) {}

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

    const encoder = new TextEncoder();
    const data = encoder.encode(rawSpecs);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return 'mach_' + hashHex.slice(0, 32);
  } catch (err) {
    console.warn('Hardware fingerprint fallback used:', err);
    return 'mach_fallback_' + Math.abs(hashCode(navigator.userAgent + screen.width + screen.height));
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
