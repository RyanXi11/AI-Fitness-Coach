// src/components/BarcodeScanner.jsx
import { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import api from '../api/axios';

export default function BarcodeScanner() {
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null); // holds the ZXing reader itself, so cleanup can reliably stop it — same lesson as Milestone 4's camera stream ref
  const [status, setStatus] = useState('idle'); // idle | scanning | denied | error
  const [product, setProduct] = useState(null);
  const [gramsEaten, setGramsEaten] = useState(100);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function startScanning() {
    setStatus('scanning');
    setError('');
    setProduct(null);
    setResult(null);

    try {
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      // Explicitly prefer the rear/outward-facing camera — leaving this
      // to browser default (as decodeFromVideoDevice(undefined, ...)
      // would) can select the front-facing selfie camera instead, which
      // makes scanning a barcode in front of you physically awkward.
      // 'ideal' rather than 'exact' still lets this gracefully fall back
      // to whatever's available on a device with only one camera.
      await codeReader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        async (scanResult) => {
          if (scanResult) {
            const barcode = scanResult.getText();
            codeReader.reset(); // stop scanning the instant we get a hit
            setStatus('found');
            await lookupProduct(barcode);
          }
          // per-frame decode misses fire constantly while no barcode is in
          // view — that's normal scanning behavior, not an error to surface
        }
      );
    } catch (err) {
      setStatus(err.name === 'NotAllowedError' ? 'denied' : 'error');
    }
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log meal');
    }
  }

  // Stop the scanner (and release the camera) on unmount — ZXing's own
  // reset() correctly handles stopping the underlying MediaStream
  useEffect(() => {
    return () => {
      codeReaderRef.current?.reset();
    };
  }, []);

  return (
    <div className="barcode-scanner">
      {status === 'idle' && !product && !result && (
        <button onClick={startScanning} className="analyze-button">Scan a barcode</button>
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
