// src/components/MealLogger.jsx — wraps MealPhotoUpload and BarcodeScanner
// behind a tab toggle, since they're genuinely different flows (a static
// photo analyzed by Gemini vs. live camera barcode scanning) rather than
// variations of the same component.
import { useState } from 'react';
import MealPhotoUpload from './MealPhotoUpload';
import BarcodeScanner from './BarcodeScanner';

export default function MealLogger() {
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

      {mode === 'photo' ? <MealPhotoUpload /> : <BarcodeScanner />}
    </div>
  );
}
