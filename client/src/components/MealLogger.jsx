// src/components/MealLogger.jsx — wraps MealPhotoUpload and BarcodeScanner
// behind a tab toggle, since they're genuinely different flows (a static
// photo analyzed by Gemini vs. live camera barcode scanning) rather than
// variations of the same component.
import { lazy, Suspense, useState } from 'react';
import MealPhotoUpload from './MealPhotoUpload';

// Loaded only when the barcode tab is opened. ZXing is the single largest
// dependency here (~482 KB) and the default photo flow never touches it.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'));

export default function MealLogger({ onLogged }) {
  const [mode, setMode] = useState('photo');

  return (
    <div className="meal-logger">
      <div className="day-tabs">
        <button
          className={mode === 'photo' ? 'day-tab active' : 'day-tab'}
          onClick={() => setMode('photo')}
        >
          📷 Photo
        </button>
        <button
          className={mode === 'barcode' ? 'day-tab active' : 'day-tab'}
          onClick={() => setMode('barcode')}
        >
          🔢 Barcode
        </button>
      </div>

      {mode === 'photo' ? (
        <MealPhotoUpload onLogged={onLogged} />
      ) : (
        <Suspense fallback={<span className="skeleton skeleton-line" />}>
          <BarcodeScanner onLogged={onLogged} />
        </Suspense>
      )}
    </div>
  );
}
