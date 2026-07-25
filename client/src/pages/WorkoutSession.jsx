// src/pages/WorkoutSession.jsx
import { Link } from 'react-router-dom';
import CameraFeed from '../components/CameraFeed';

export default function WorkoutSession() {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Form Check</h1>
        <Link to="/dashboard">Back to dashboard</Link>
      </div>

      <CameraFeed />
    </div>
  );
}