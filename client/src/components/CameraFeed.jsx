// src/components/CameraFeed.jsx
import { useRef, useState, useEffect } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import api from '../api/axios';

// MediaPipe Pose's 33-landmark topology — these three indices are fixed
// by the model itself, not something we choose
const LEFT_HIP = 23;
const LEFT_KNEE = 25;
const LEFT_ANKLE = 27;

// The angle at which we consider a rep "deep enough." Fixed threshold,
// per the locked design decision — not calibrated per user. Originally
// set to 100° based on real test data (good rep ~70°, shallow rep
// ~140°); tightened to 95° after further testing to require deeper reps,
// while staying within the standard "parallel squat" convention (~90-100°)
// rather than pushing past it into overly strict territory.
const DEPTH_THRESHOLD = 95;
// Angle above which we consider the lifter fully "standing" again —
// used only to exit the ascending phase back to standing
const STANDING_THRESHOLD = 160;
// A separate, lower threshold required to actually START tracking a
// new rep. Using the SAME number for both "you've started descending"
// and "you're back to standing" creates a single boundary with zero
// margin — small noise near 160° can dip below it and immediately tick
// back up, completing a full fake rep cycle in 2-3 frames. Requiring a
// meaningfully lower angle to confirm a real descent (a "hysteresis
// gap" between the two thresholds) means ordinary standing sway can
// never trigger a false rep on its own.
const DESCENT_CONFIRM_THRESHOLD = 140;

// Given three landmarks, returns the angle (in degrees) at vertex `b`
function calculateAngle(a, b, c) {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle; // atan2 can return >180 for some configurations
  return angle;
}

export default function CameraFeed() {
  const videoRef = useRef(null);
  const streamRef = useRef(null); // holds the MediaStream itself — see Milestone 3's ref-cleanup bug
  const landmarkerRef = useRef(null); // holds the loaded PoseLandmarker model
  const animationFrameRef = useRef(null); // so we can cancel the detection loop on cleanup

  const [status, setStatus] = useState('idle'); // idle | requesting | active | denied | error
  const [modelReady, setModelReady] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [trackingLost, setTrackingLost] = useState(false);

  // Rolling buffer of recent raw angle readings. Pose landmark detection
  // is noisy frame-to-frame — even during a real, continuous descent,
  // single frames can briefly jitter upward due to detection noise, not
  // actual movement. Averaging over a small window smooths that noise
  // out before the state machine has to make a decision off it.
  const angleHistory = useRef([]);
  const SMOOTHING_WINDOW = 5;

  function getSmoothedAngle(rawAngle) {
    const history = angleHistory.current;
    history.push(rawAngle);
    if (history.length > SMOOTHING_WINDOW) history.shift();
    return history.reduce((sum, a) => sum + a, 0) / history.length;
  }

  // Rep state machine — tracked in a ref, not state, because it updates
  // every single video frame (dozens of times a second). Using React
  // state here would trigger a re-render on every frame, which is far
  // more expensive than this feature needs.
  const repState = useRef({ phase: 'standing', prevAngle: 180, bottomAngle: null, lastRepTime: 0 });

  // A real squat rep, even done quickly, realistically takes at least
  // this long. Without this floor, brief postural sway near the
  // STANDING_THRESHOLD boundary (e.g. standing normally around 170°
  // dipping to 158° for a fraction of a second) gets misread as a
  // complete, real repetition — found by noticing multiple "reps"
  // logged within a couple seconds, which is physically impossible.
  const MIN_REP_DURATION_MS = 800;

  // Load the pose model once, on mount — this is a genuinely slow
  // operation (downloading and initializing an ML model), so it starts
  // immediately rather than waiting for the user to click "enable camera"
  useEffect(() => {
    async function loadModel() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      );
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1, // only one person expected in frame
        // Defaults are all 0.5 — fairly conservative, so the model
        // reports "no person" on marginal frames (partial framing,
        // mid-motion, awkward angle) rather than an uncertain detection.
        // Lowered to reduce false "no person detected" dropouts; the
        // tradeoff is slightly noisier landmark positions on marginal
        // frames, which the moving-average smoothing above helps absorb.
        minPoseDetectionConfidence: 0.3,
        minPosePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3
      });
      setModelReady(true);
    }
    loadModel();
  }, []);

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
      setStatus(err.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }

  // The detection loop — runs once per available video frame via
  // requestAnimationFrame, which syncs to the browser's actual repaint
  // rate and automatically pauses when the tab isn't visible (unlike
  // setInterval, which would keep firing uselessly in a background tab)
  useEffect(() => {
    if (status !== 'active' || !modelReady) return;

    let lastVideoTime = -1;

    function detectFrame() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      // Guard against calling detectForVideo before the video actually
      // has real frame data — calling it too early throws, and since
      // the very first call happens synchronously inside this effect,
      // an uncaught throw here crashes the entire React tree (no error
      // boundary exists to contain it). readyState >= 2 (HAVE_CURRENT_DATA)
      // means the browser has an actual decoded frame available.
      const videoIsReady = video && video.readyState >= 2 && video.videoWidth > 0;

      if (videoIsReady && landmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        try {
          const result = landmarker.detectForVideo(video, performance.now());
          if (result.landmarks.length > 0) {
            const points = result.landmarks[0];
            const rawAngle = calculateAngle(
              points[LEFT_HIP],
              points[LEFT_KNEE],
              points[LEFT_ANKLE]
            );
            const smoothedAngle = getSmoothedAngle(rawAngle);
            processAngle(smoothedAngle);
            setTrackingLost(false);
          } else {
            // No person detected this frame — surface this explicitly
            // rather than silently leaving stale angle/phase data on
            // screen, which would look identical to a genuine freeze.
            setTrackingLost(true);
          }
        } catch (err) {
          // Never let a single bad frame take down the whole app —
          // log it and keep the loop running for the next frame instead
          console.error('Pose detection error on this frame:', err);
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectFrame);
    }

    detectFrame();

    // Stop the loop when the camera becomes inactive or this effect
    // re-runs — otherwise detection keeps running against a stale video
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, modelReady]);

  // The state machine from the design walkthrough: standing → descending
  // → bottom (evaluate depth here, once) → ascending → back to standing
  function processAngle(angle) {
    const state = repState.current;

    if (state.phase === 'standing' && angle < DESCENT_CONFIRM_THRESHOLD) {
      state.phase = 'descending';
    } else if (state.phase === 'descending') {
      if (angle >= state.prevAngle) {
        const now = performance.now();
        const longEnoughSinceLastRep = now - state.lastRepTime >= MIN_REP_DURATION_MS;

        if (longEnoughSinceLastRep) {
          // Real bottom of a genuine rep — evaluate and log it
          state.bottomAngle = state.prevAngle;
          state.lastRepTime = now;
          evaluateRep(state.bottomAngle);
        }
        // Either way, this reversal is real (angle stopped decreasing),
        // so still transition to ascending — we just skip logging it
        // as a rep if it happened too soon after the last one (sway/jitter)
        state.phase = 'ascending';
      }
    } else if (state.phase === 'ascending' && angle > STANDING_THRESHOLD) {
      state.phase = 'standing'; // rep fully complete, ready for the next one
    }

    state.prevAngle = angle;
  }

  async function evaluateRep(bottomAngle) {
    const hitDepth = bottomAngle <= DEPTH_THRESHOLD;
    const message = hitDepth ? 'Good depth!' : 'Not deep enough';
    setFeedback(message);

    try {
      await api.post('/formFeedback', {
        exercise: 'squat',
        issues: hitDepth ? [] : ['not deep enough']
      });
    } catch (err) {
      console.error('Failed to log form feedback:', err);
    }
  }

  // Cleanup: stop the camera stream (using streamRef, not videoRef —
  // see Milestone 3) and cancel any in-flight detection loop
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="camera-feed">
      {status === 'idle' && (
        <div className="camera-placeholder">
          <p>Camera access is needed to check your form during a set.</p>
          <button onClick={enableCamera} disabled={!modelReady}>
            {modelReady ? 'Enable camera' : 'Loading pose model...'}
          </button>
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

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: status === 'active' ? 'block' : 'none' }}
      />

      {status === 'active' && feedback && (
        <p className="form-feedback">{feedback}</p>
      )}

      {status === 'active' && trackingLost && (
        <p className="tracking-lost">Can't see you clearly — make sure your hip, knee, and ankle are all in frame.</p>
      )}
    </div>
  );
}
