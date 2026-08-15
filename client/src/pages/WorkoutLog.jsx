// src/pages/WorkoutLog.jsx — the logging screen, split out of Dashboard so
// Home is a read-only overview and this is where you actually do something.
import { Link } from 'react-router-dom';
import WorkoutForm from '../components/WorkoutForm';

export default function WorkoutLog() {
  return (
    <div className="page">
      {/* No onLogged callback: WorkoutForm shows its own confirmation, and
          Home refetches when you navigate back to it. */}
      <WorkoutForm />

      <div className="action-card">
        <div>
          <strong>Squat form check</strong>
          <p>Live depth feedback through your camera.</p>
        </div>
        <Link to="/session" className="secondary-button">Start</Link>
      </div>
    </div>
  );
}
