// src/components/CameraFeed.jsx
//
// Milestone 3 scope: skeleton only — access the webcam and display the
// feed. No pose detection logic yet; that's Milestone 4.
//
// Design decision: camera access is gated behind an explicit "Enable
// camera" button rather than auto-requesting on mount. Browsers treat
// auto-prompted permission requests with increasing suspicion (and may
// start suppressing them after repeated denials), and an explicit click
// gives us a natural moment to explain why we need camera access, plus
// a clean retry path if permission is denied.

import { useRef, useState, useEffect } from 'react';

export default function CameraFeed() {
  const videoRef = useRef(null);
  // Separate ref just for the raw MediaStream. React nulls out DOM refs
  // (like videoRef) synchronously during unmount, BEFORE useEffect
  // cleanup functions run — so reading videoRef.current.srcObject at
  // cleanup time would already be null. Storing the stream itself in
  // its own plain ref sidesteps that timing entirely.
  const streamRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | requesting | active | denied | error

  async function enableCamera() {
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus('active');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setStatus('denied');
      } else {
        setStatus('error');
      }
    }
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="camera-feed">
      {status === 'idle' && (
        <div className="camera-placeholder">
          <p>Camera access is needed to check your form during a set.</p>
          <button onClick={enableCamera}>Enable camera</button>
        </div>
      )}

      {status === 'requesting' && (
        <div className="camera-placeholder">
          <p>Waiting for camera permission...</p>
        </div>
      )}

      {status === 'denied' && (
        <div className="camera-placeholder">
          <p>Camera access was denied. Form checking needs your camera to work.</p>
          <button onClick={enableCamera}>Try again</button>
        </div>
      )}

      {status === 'error' && (
        <div className="camera-placeholder">
          <p>Couldn't access a camera. Make sure one is connected and not in use by another app.</p>
          <button onClick={enableCamera}>Try again</button>
        </div>
      )}

      {/* Always rendered (even before active), so videoRef.current
          exists the moment enableCamera() runs — just hidden until active */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: status === 'active' ? 'block' : 'none' }}
      />
    </div>
  );
}
