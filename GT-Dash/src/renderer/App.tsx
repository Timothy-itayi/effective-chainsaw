// Main React App component
import React, { useState, useEffect } from 'react';
import { TelemetryPacket, ConnectionStatus } from '../shared/types';
import './App.css';

function App() {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [connected, setConnected] = useState(false);
  const [psIP, setPsIP] = useState('192.168.0.194'); // Default from your test
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    psIP: null,
    lastPacketTime: null,
  });
  const [packetCount, setPacketCount] = useState(0);

  useEffect(() => {
    // Set up telemetry listener
    window.gt7.onTelemetry((data: TelemetryPacket) => {
      setTelemetry(data);
      setPacketCount(prev => prev + 1);
    });

    // Set up connection status listener
    window.gt7.onConnectionChange((status: ConnectionStatus) => {
      setConnectionStatus(status);
      setConnected(status.connected);
    });

    // Get initial connection status
    window.gt7.getConnectionStatus().then((status: ConnectionStatus) => {
      setConnectionStatus(status);
      setConnected(status.connected);
    });

    return () => {
      window.gt7.removeTelemetryListener();
      window.gt7.removeConnectionChangeListener();
    };
  }, []);

  const handleConnect = async () => {
    if (!psIP.trim()) {
      alert('Please enter PlayStation IP address');
      return;
    }

    const success = await window.gt7.connect(psIP.trim());
    if (!success) {
      alert('Failed to connect. Make sure GT7 is running and telemetry is enabled.');
    }
  };

  const handleDisconnect = async () => {
    await window.gt7.disconnect();
    setPacketCount(0);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1>GT7 Delta Dashboard</h1>
          <div className="connection-controls">
            <input
              type="text"
              placeholder="PlayStation IP"
              value={psIP}
              onChange={(e) => setPsIP(e.target.value)}
              disabled={connected}
              className="ip-input"
            />
            {!connected ? (
              <button onClick={handleConnect} className="btn btn-connect">
                Connect
              </button>
            ) : (
              <button onClick={handleDisconnect} className="btn btn-disconnect">
                Disconnect
              </button>
            )}
            <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} />
            <span className="status-text">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        {connected && (
          <div className="header-stats">
            <span>Packets: {packetCount.toLocaleString()}</span>
            {connectionStatus.lastPacketTime && (
              <span>
                Last: {new Date(connectionStatus.lastPacketTime).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </header>

      <main className="main-content">
        {connected && telemetry ? (
          <div className="dashboard">
            {/* Primary Metrics - Large Display */}
            <section className="primary-metrics">
              <MetricCard
                label="Speed"
                value={`${telemetry.speedKmh.toFixed(1)}`}
                unit="km/h"
                large
                color="#4CAF50"
              />
              <MetricCard
                label="RPM"
                value={Math.round(telemetry.rpm).toLocaleString()}
                unit="rpm"
                large
                color="#2196F3"
              />
              <MetricCard
                label="Gear"
                value={telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : telemetry.gear.toString()}
                large
                color="#FF9800"
              />
            </section>

            {/* Inputs Section */}
            <section className="inputs-section">
              <h2>Inputs</h2>
              <div className="metric-grid">
                <ProgressMetric
                  label="Throttle"
                  value={telemetry.throttle}
                  color="#4CAF50"
                />
                <ProgressMetric
                  label="Brake"
                  value={telemetry.brake}
                  color="#f44336"
                />
              </div>
            </section>

            {/* Lap Information */}
            <section className="lap-section">
              <h2>Lap Information</h2>
              <div className="metric-grid">
                <MetricCard label="Current Lap" value={telemetry.currentLap.toString()} />
                <MetricCard
                  label="Last Lap Time"
                  value={formatLapTime(telemetry.lastLapTime)}
                />
                <MetricCard
                  label="Best Lap Time"
                  value={formatLapTime(telemetry.bestLapTime)}
                />
                <MetricCard
                  label="Lap Distance"
                  value={`${telemetry.lapDistance.toFixed(0)} m`}
                />
              </div>
            </section>

            {/* Vehicle Information */}
            <section className="vehicle-section">
              <h2>Vehicle</h2>
              <div className="metric-grid">
                <MetricCard label="Car ID" value={telemetry.carId.toString()} />
                <MetricCard
                  label="Fuel Level"
                  value={`${(telemetry.fuelLevel * 100).toFixed(1)}%`}
                />
                <MetricCard
                  label="Fuel Capacity"
                  value={`${telemetry.fuelCapacity.toFixed(1)} L`}
                />
                <MetricCard label="Packet ID" value={telemetry.packetId.toString()} />
              </div>
            </section>

            {/* Position */}
            <section className="position-section">
              <h2>Position</h2>
              <div className="metric-grid">
                <MetricCard label="X" value={telemetry.position.x.toFixed(2)} />
                <MetricCard label="Y" value={telemetry.position.y.toFixed(2)} />
                <MetricCard label="Z" value={telemetry.position.z.toFixed(2)} />
              </div>
            </section>
          </div>
        ) : (
          <div className="empty-state">
            {connected ? (
              <div>
                <div className="spinner" />
                <p>Waiting for telemetry data...</p>
                <p className="hint">Make sure GT7 is running and you're in a race/time trial</p>
              </div>
            ) : (
              <div>
                <p>Connect to GT7 to start receiving telemetry</p>
                <p className="hint">Enter your PlayStation IP address and click Connect</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  large,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  large?: boolean;
  color?: string;
}) {
  return (
    <div className={`metric-card ${large ? 'metric-card-large' : ''}`} style={{ borderTopColor: color }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color }}>
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const percentage = Math.round(value * 100);
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="progress-container">
        <div
          className="progress-bar"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
        <span className="progress-text">{percentage}%</span>
      </div>
    </div>
  );
}

function formatLapTime(ms: number): string {
  if (ms === 0 || ms === -1) return '--:--.---';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

export default App;
