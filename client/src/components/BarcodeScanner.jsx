// src/components/BarcodeScanner.jsx
import { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import api from '../api/axios';

// Retail food packaging only ever carries these four symbologies. Without this
// hint ZXing tries every format it knows (QR, Micro QR, Aztec, PDF417, Data
// Matrix...) on every single frame, which both slows each decode pass down
// enough to miss barcodes and floods the console with failures from readers
// that were never going to match.
const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E
];

export default function BarcodeScanner({ onLogged }) {
  // Opt-in debugging aid, not a user-facing feature. Deliberately NOT gated on
  // import.meta.env.DEV: camera behavior can only be tested on a real phone,
  // which requires HTTPS and therefore the production build — a dev-only gate
  // would hide this in the exact environment it exists to diagnose.
  const showDiagnostics = new URLSearchParams(window.location.search).has('debug');

  const videoRef = useRef(null);
  // Holds the IScannerControls handle returned by decodeFromConstraints, so
  // cleanup can reliably stop it — same lesson as Milestone 4's camera stream
  // ref. The reader object itself has no stop/reset method in @zxing/browser
  // v0.2.x; the returned controls handle is the ONLY way to end a scan.
  const controlsRef = useRef(null);
  const handledRef = useRef(false); // the decode loop keeps running for a beat after a hit; ignore repeat callbacks for the same scan
  const statsRef = useRef({ attempts: 0, lastError: '' }); // counted in a ref, not state — the loop fires ~10x/sec and re-rendering that often would be wasteful
  const diagTimerRef = useRef(null);
  const cancelledRef = useRef(false);
  const [status, setStatus] = useState('idle'); // idle | scanning | found | denied | error
  const [product, setProduct] = useState(null);
  const [gramsEaten, setGramsEaten] = useState(100);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [diag, setDiag] = useState(null);

  async function startScanning() {
    setStatus('scanning');
    setError('');
    setProduct(null);
    setResult(null);
    handledRef.current = false;
    cancelledRef.current = false;
    statsRef.current = { attempts: 0, lastError: '' };

    try {
      const hints = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS],
        // Spends more time per frame (trying extra rows and rotations) in
        // exchange for reading marginal images. Worth it here: the frames are
        // coming from a handheld camera on a curved package, not a flatbed.
        [DecodeHintType.TRY_HARDER, true]
      ]);
      // Default is 500ms between attempts, i.e. only two shots per second at
      // holding the barcode steady in frame. 100ms gives the user a far wider
      // window to land a readable frame.
      const codeReader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });

      // Explicitly prefer the rear/outward-facing camera — leaving this
      // to browser default (as decodeFromVideoDevice(undefined, ...)
      // would) can select the front-facing selfie camera instead, which
      // makes scanning a barcode in front of you physically awkward.
      // 'ideal' rather than 'exact' still lets this gracefully fall back
      // to whatever's available on a device with only one camera.
      // The resolution request matters just as much: a 1D barcode's bars are
      // only a few pixels wide at the default 640x480, which is what produces
      // near-miss Checksum/Format errors instead of clean reads.
      const controls = await codeReader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        videoRef.current,
        (scanResult, scanErr, scanControls) => {
          // Errors thrown here would surface as an unhandled promise rejection
          // rather than reaching the catch below, so handle everything inline.
          if (!scanResult) {
            // per-frame decode misses fire constantly while no barcode is in
            // view — that's normal scanning behavior, not an error to surface
            statsRef.current.attempts += 1;
            statsRef.current.lastError = scanErr?.name || scanErr?.message || '';
            return;
          }
          if (handledRef.current) return;
          handledRef.current = true;
          scanControls.stop(); // stop scanning (and release the camera) the instant we get a hit
          clearInterval(diagTimerRef.current);
          setStatus('found');
          lookupProduct(scanResult.getText());
        }
      );
      controlsRef.current = controls;

      // Cancel is clickable the moment status flips to 'scanning', but there's
      // nothing to stop until getUserMedia resolves — which can take seconds
      // behind a permission prompt. Honor a cancel that landed in that window,
      // otherwise the camera stays live with no UI attached to it.
      if (cancelledRef.current) {
        controls.stop();
        return;
      }

      // There's no devtools console on a phone, so surface the decoder's
      // progress on screen instead: a climbing attempt count means the loop is
      // alive and the camera simply isn't producing a readable frame, while a
      // frozen count means the loop itself died.
      if (showDiagnostics) {
        const settings = videoRef.current?.srcObject?.getVideoTracks?.()[0]?.getSettings?.() ?? {};
        diagTimerRef.current = setInterval(() => {
          setDiag({ width: settings.width, height: settings.height, ...statsRef.current });
        }, 500);
      }
    } catch (err) {
      setStatus(err.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }

  // Releases the camera without unmounting — leaving the component was
  // previously the only way to stop an in-progress scan.
  function cancelScanning() {
    cancelledRef.current = true;
    controlsRef.current?.stop();
    clearInterval(diagTimerRef.current);
    setDiag(null);
    setStatus('idle');
  }

  async function lookupProduct(barcode) {
    try {
      const res = await api.get(`/mealLogs/lookup-barcode/${barcode}`);
      setProduct(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Product not found');
      setStatus('idle');
    }
  }

  async function handleConfirm() {
    try {
      const res = await api.post('/mealLogs/barcode', {
        foodDescription: product.foodDescription,
        caloriesPer100g: product.caloriesPer100g,
        proteinPer100g: product.proteinPer100g,
        carbsPer100g: product.carbsPer100g,
        fatPer100g: product.fatPer100g,
        gramsEaten: Number(gramsEaten)
      });
      setResult(res.data);
      setProduct(null);
      setStatus('idle');
      onLogged?.(); // refreshes today's totals; the result above stays on screen
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log meal');
    }
  }

  // Stop the scanner (and release the camera) on unmount — ZXing's stop()
  // correctly tears down the underlying MediaStream
  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      clearInterval(diagTimerRef.current);
    };
  }, []);

  return (
    <div className="barcode-scanner">
      {/* Deliberately not conditioned on `!result` — the previous scan's result
          stays on screen as a receipt, and hiding this button while it was
          visible left the user with no way to start another scan. */}
      {status === 'idle' && !product && (
        <button onClick={startScanning} className="analyze-button">
          {result ? 'Scan another barcode' : 'Scan a barcode'}
        </button>
      )}

      {status === 'denied' && (
        <p className="error">
          Camera access was denied. <button onClick={startScanning}>Try again</button>
        </p>
      )}
      {status === 'error' && (
        <p className="error">
          Couldn't access a camera. <button onClick={startScanning}>Try again</button>
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ display: status === 'scanning' ? 'block' : 'none', width: '100%', borderRadius: '4px' }}
      />

      {showDiagnostics && status === 'scanning' && diag && (
        <p className="scan-diagnostics">
          {diag.width}x{diag.height} · {diag.attempts} attempts
          {diag.lastError && ` · ${diag.lastError}`}
        </p>
      )}

      {status === 'scanning' && (
        <button onClick={cancelScanning} className="secondary-button">Cancel</button>
      )}

      {/* The barcode is decoded before the Open Food Facts lookup returns, so
          there's a real gap here with nothing else on screen to explain it. */}
      {status === 'found' && !product && <p>Looking up product…</p>}

      {product && (
        <div className="meal-result">
          <p className="food-description">{product.foodDescription}</p>
          <label className="grams-input-label">
            Grams eaten:
            <input
              type="number"
              value={gramsEaten}
              onChange={(e) => setGramsEaten(e.target.value)}
              className="grams-input"
            />
          </label>
          <button onClick={handleConfirm} className="analyze-button">Log this</button>
          {/* Escape hatch for a mis-scan — otherwise the only way out of a
              wrong product is logging it or leaving the tab. */}
          <button onClick={startScanning} className="secondary-button">Scan a different item</button>
        </div>
      )}

      {result && (
        <div className="meal-result">
          <p className="food-description">{result.foodDescription}</p>
          <p className="calorie-estimate">{result.estimatedCalories} calories</p>
          <div className="macro-row">
            <span>{result.protein}g protein</span>
            <span>{result.carbs}g carbs</span>
            <span>{result.fat}g fat</span>
          </div>
        </div>
      )}
    </div>
  );
}
