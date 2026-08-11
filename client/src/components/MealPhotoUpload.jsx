// src/components/MealPhotoUpload.jsx
import { useState, useEffect } from 'react';
import api from '../api/axios';

export default function MealPhotoUpload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function fileToBase64(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBlob);
    });
  }

  function resizeImage(file, maxDimension = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          let { width, height } = img;
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

  // Selecting a photo now only shows a preview — it no longer triggers
  // analysis immediately, since the user should get a chance to add an
  // optional description before the request goes out.
  function handleFileChange(e) {
    const selected = e.target.files[0];
    if (!selected) return;

    setError('');
    setResult(null);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function handleSubmit() {
    if (!file) return;

    setError('');
    setLoading(true);

    try {
      const resizedBlob = await resizeImage(file);
      const base64 = await fileToBase64(resizedBlob);
      const res = await api.post('/mealLogs', {
        image: base64,
        mimeType: 'image/jpeg',
        description: description.trim() || undefined
      });
      setResult(res.data);
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
          capture="environment"
          onChange={handleFileChange}
          hidden
        />
      </label>

      {preview && <img src={preview} alt="Meal preview" className="meal-preview" />}

      {preview && !result && (
        <>
          <textarea
            placeholder="Add context, e.g. 'extra dressing, double portion' (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="meal-description-input"
          />
          <button onClick={handleSubmit} disabled={loading} className="analyze-button">
            {loading ? 'Analyzing...' : 'Log meal'}
          </button>
        </>
      )}

      {error && <p className="error">{error}</p>}

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
