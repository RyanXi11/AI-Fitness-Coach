// src/components/MealPhotoUpload.jsx
import { useState, useEffect } from 'react';
import api from '../api/axios';

export default function MealPhotoUpload() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Object URLs created by createObjectURL live in browser memory until
  // explicitly revoked. Lower stakes than the Milestone 4 camera stream
  // (one photo, not a continuous feed), but still worth cleaning up
  // correctly — revoke the previous preview whenever a new one is set,
  // and on unmount.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Converts a File into a base64 string with no "data:image/..." prefix
  // — matches the { image, mimeType } shape the backend route expects
  function fileToBase64(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBlob);
    });
  }

  // Downscales the image before upload. A modern phone photo is often
  // much higher resolution than a vision model needs to identify food
  // and estimate portion size — sending it at full size just adds
  // network transfer time and likely model processing time for no real
  // benefit. Capping the longest side at 1024px keeps plenty of detail
  // for this task while meaningfully shrinking the payload.
  function resizeImage(file, maxDimension = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          let { width, height } = img;

          // Only scale DOWN — never upscale a smaller image, since that
          // wouldn't speed anything up and could reduce quality
          if (width > height && width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    setResult(null);
    setPreview(URL.createObjectURL(file)); // local-only preview, never touches the server
    setLoading(true);

    try {
      const resizedBlob = await resizeImage(file);
      const base64 = await fileToBase64(resizedBlob);
      // canvas.toBlob always outputs 'image/jpeg' here, regardless of
      // the original file's format, since resizeImage re-encodes it
      const res = await api.post('/mealLogs', { image: base64, mimeType: 'image/jpeg' });
      setResult(res.data);
      // No page reload here — unlike WorkoutForm, this component's whole
      // purpose is showing the result on screen. Nothing on the dashboard
      // currently depends on meal log data, so there's nothing to refresh.
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze photo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="meal-upload">
      <h2>Log a meal</h2>

      <label className="photo-input-label">
        {preview ? 'Choose a different photo' : 'Take or choose a photo'}
        <input
          type="file"
          accept="image/*"
          capture="environment" // hints mobile browsers to open the rear camera directly, not just a gallery picker
          onChange={handleFileChange}
          hidden
        />
      </label>

      {preview && <img src={preview} alt="Meal preview" className="meal-preview" />}

      {loading && <p>Analyzing photo...</p>}
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="meal-result">
          <p className="food-description">{result.foodDescription}</p>
          <p className="calorie-estimate">{result.estimatedCalories} calories</p>
        </div>
      )}
    </div>
  );
}
