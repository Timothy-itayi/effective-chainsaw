import React, { useState, useEffect, useRef } from 'react';
import { TelemetryPacket, ConnectionStatus } from '../shared/types';
import './App.css';

interface LapRecord {
  lapNumber: number;
  time: number; // in milliseconds
  isBest: boolean;
}

function App() {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [connected, setConnected] = useState(false);
  const [psIP, setPsIP] = useState('192.168.0.194'); // Will be loaded from persistence
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [tracksByRegion, setTracksByRegion] = useState<Record<string, any[]>>({});
  const [regions, setRegions] = useState<string[]>([]);
  const [lapTimes, setLapTimes] = useState<LapRecord[]>([]);
  const lastLapTimeRef = useRef<number>(0);
  const [captureStatus, setCaptureStatus] = useState<any>(null);
  const [trackMap, setTrackMap] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    psIP: null,
    lastPacketTime: null,
  });

  useEffect(() => {
    // Load tracks and regions
    window.gt7.getAllTracks().then(setTracks);
    window.gt7.getTracksByRegion().then(setTracksByRegion);
    window.gt7.getAllRegions().then(setRegions);
    
    // Load persisted track selection and PS IP
    window.gt7.getSelectedTrackId().then((trackId) => {
      if (trackId) {
        setSelectedTrackId(trackId);
        // Find region for selected track
        window.gt7.getAllTracks().then((allTracks) => {
          const track = allTracks.find(t => t.id === trackId);
          if (track) {
            setSelectedRegion(track.region);
            // Also select the track in the backend
            window.gt7.selectTrack(trackId);
          }
        });
        // Load track map if available
        window.gt7.loadTrackMap(trackId).then((map) => {
          if (map) {
            setTrackMap(map);
          }
        });
      }
    });
    
    // Load persisted PS IP
    window.gt7.getPsIP().then((ip) => {
      if (ip) {
        setPsIP(ip);
      }
    });

    let lastSeen = 0;

    window.gt7.onTelemetry((data: TelemetryPacket) => {
      setTelemetry(data);
      
      // Track completed laps: detect when lastLapTime changes and is valid
      if (data.lastLapTime > 0 && data.lastLapTime !== lastLapTimeRef.current) {
        const isBest = data.lastLapTime === data.bestLapTime;
        
        setLapTimes(prev => {
          // Determine lap number: if currentLap > 0, use currentLap - 1 (the lap that just completed)
          // Otherwise, use the next sequential number
          const newLapNumber = data.currentLap > 0 
            ? data.currentLap - 1 
            : (prev.length > 0 ? Math.max(...prev.map(l => l.lapNumber)) + 1 : 1);
          
          // Check if this lap is already recorded (avoid duplicates)
          const exists = prev.some(lap => lap.lapNumber === newLapNumber);
          if (exists) {
            console.log('Lap already exists:', newLapNumber);
            return prev;
          }
          
          console.log('Recording new lap:', { lapNumber: newLapNumber, time: data.lastLapTime, isBest });
          
          // Add new lap, mark previous best as false if this is new best
          const updated = prev.map(lap => ({ ...lap, isBest: false }));
          updated.push({
            lapNumber: newLapNumber,
            time: data.lastLapTime,
            isBest: isBest,
          });
          
          // Sort by lap number descending (most recent first)
          return updated.sort((a, b) => b.lapNumber - a.lapNumber);
        });
        
        lastLapTimeRef.current = data.lastLapTime;
      }
      
      // Debug: log tire temps if available
      if (data.tireTemperatures) {
        console.log('Tire temps:', data.tireTemperatures);
      }
    });

    window.gt7.onConnectionChange((status: ConnectionStatus) => {
      setConnectionStatus(status);
      setConnected(status.connected);
    });

    window.gt7.getConnectionStatus().then((status: ConnectionStatus) => {
      setConnectionStatus(status);
      setConnected(status.connected);
    });

    // Track capture status
    window.gt7.getCaptureStatus().then((status) => {
      setCaptureStatus(status);
      console.log('Initial capture status:', status);
    });
    window.gt7.onCaptureStatusChanged((status: any) => {
      console.log('Capture status changed:', status);
      setCaptureStatus(status);
    });

    return () => {
      window.gt7.removeTelemetryListener();
      window.gt7.removeConnectionChangeListener();
      window.gt7.removeCaptureStatusListener();
    };
  }, []);

  const handleTrackSelect = async (trackId: string) => {
    setSelectedTrackId(trackId);
    await window.gt7.selectTrack(trackId);
    // Update selected region based on track
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      setSelectedRegion(track.region);
    }
    // Load track map if available
    const map = await window.gt7.loadTrackMap(trackId);
    setTrackMap(map);
  };

  const handleRegionSelect = (region: string) => {
    setSelectedRegion(region);
    // Clear track selection when changing regions
    setSelectedTrackId('');
    window.gt7.selectTrack('');
  };

  const handleConnect = async () => {
    if (!psIP.trim()) {
      alert('Enter PlayStation IP');
      return;
    }
    const success = await window.gt7.connect(psIP.trim());
    if (!success) alert('Connection failed. Check IP/GT7.');
  };

  const handleDisconnect = async () => {
    await window.gt7.disconnect();
    // Clear lap times on disconnect
    setLapTimes([]);
    lastLapTimeRef.current = 0;
  };

  const handleStartCapture = async () => {
    if (!selectedTrackId) {
      alert('Please select a track first');
      return;
    }
    
    // Check if connected (needed for UDP packets during replay)
    if (!connected) {
      const proceed = confirm('You need to be connected to GT7 for capture to work.\n\nMake sure:\n1. GT7 is running\n2. You are connected (green indicator)\n3. Replay is playing\n\nClick OK to try anyway, or Cancel to connect first.');
      if (!proceed) return;
    }
    
    try {
      console.log('Starting capture for track:', selectedTrackId);
      await window.gt7.startTrackCapture(selectedTrackId);
      // Refresh capture status after starting
      const status = await window.gt7.getCaptureStatus();
      setCaptureStatus(status);
      console.log('Capture started:', status);
      
      if (!status || !status.isActive) {
        alert('Capture did not start. Check console for errors.');
      }
    } catch (error) {
      console.error('Failed to start capture:', error);
      alert(`Failed to start capture: ${error}. Make sure GT7 is running and connected.`);
    }
  };

  const handleStopCapture = async () => {
    try {
      await window.gt7.stopTrackCapture();
      // Refresh capture status after stopping
      const status = await window.gt7.getCaptureStatus();
      setCaptureStatus(status);
      console.log('Capture stopped:', status);
    } catch (error) {
      console.error('Failed to stop capture:', error);
    }
  };

  const handleProcessCapture = async () => {
    const map = await window.gt7.processAndSaveTrackCapture();
    if (map) {
      setTrackMap(map);
      if (map.lengthMeters < 100) {
        alert(`Warning: Track length seems too short (${map.lengthMeters.toFixed(1)}m).\n\nThis might mean:\n- Not enough points captured\n- Replay didn't complete a full lap\n- Speed filter removed too many points\n\nTry capturing again with a full clean lap.`);
      } else {
        // Prompt for sector times
        const s1Time = prompt('Enter Sector 1 time in seconds (e.g., 20.6):');
        const s2Time = prompt('Enter Sector 2 cumulative time in seconds (e.g., 62.6 for 1:02.6):');
        const totalTime = prompt('Enter total lap time in seconds (e.g., 99.337 for 1:39.337):');
        
        if (s1Time && s2Time && totalTime) {
          const s1 = parseFloat(s1Time);
          const s2 = parseFloat(s2Time);
          const total = parseFloat(totalTime);
          
          if (!isNaN(s1) && !isNaN(s2) && !isNaN(total) && total > 0) {
            const s1Fraction = s1 / total;
            const s2Fraction = s2 / total;
            
            await window.gt7.saveTrackMapSectors(map.trackId, [s1Fraction, s2Fraction]);
            // Reload track map to get updated sectors
            const updatedMap = await window.gt7.loadTrackMap(map.trackId);
            setTrackMap(updatedMap);
            
            alert(`Track map saved!\n\nLength: ${map.lengthMeters.toFixed(1)}m\nPoints: ${map.centerline.length}\n\nSector fractions set:\n- S1: ${(s1Fraction * 100).toFixed(1)}%\n- S2: ${(s2Fraction * 100).toFixed(1)}%\n- S3: ${((1 - s2Fraction) * 100).toFixed(1)}%`);
          } else {
            alert(`Track map saved!\n\nLength: ${map.lengthMeters.toFixed(1)}m\nPoints: ${map.centerline.length}\n\nSector fractions not set (invalid input). You can set them later.`);
          }
        } else {
          alert(`Track map saved!\n\nLength: ${map.lengthMeters.toFixed(1)}m\nPoints: ${map.centerline.length}\n\nSector fractions not set. You can set them later using the API.`);
        }
      }
    } else {
      alert('No capture data to process. Make sure you captured points during replay.');
    }
  };

  return (
    <div className="racing-ui">
      {/* Top Status Bar (Pit Wall) */}
      <header className="pit-wall">
        <div className="brand">
          <span className="accent">GT7</span> DELTA
        </div>
        
        <div className="connection-cluster">
          {/* Region Pills */}
          <div className="region-pills">
            {regions.map(region => (
              <button
                key={region}
                onClick={() => handleRegionSelect(region)}
                className={`region-pill ${selectedRegion === region ? 'active' : ''}`}
                disabled={captureStatus?.isActive}
              >
                {region}
              </button>
            ))}
          </div>
          
          {/* Track Selection - shown when region is selected */}
          {selectedRegion && tracksByRegion[selectedRegion] && (
            <div className="track-selector">
              {tracksByRegion[selectedRegion].map(track => (
                <button
                  key={track.id}
                  onClick={() => handleTrackSelect(track.id)}
                  className={`track-pill ${selectedTrackId === track.id ? 'active' : ''}`}
                  disabled={captureStatus?.isActive}
                  title={track.name}
                >
                  {track.name}
                </button>
              ))}
            </div>
          )}
          
          {/* Show selected track if no region selected but track is set */}
          {!selectedRegion && selectedTrackId && (
            <div className="selected-track-display">
              {tracks.find(t => t.id === selectedTrackId)?.name || selectedTrackId}
            </div>
          )}
          
          <input
            type="text"
            value={psIP}
            onChange={(e) => {
              const newIP = e.target.value;
              setPsIP(newIP);
              // Persist PS IP
              window.gt7.setPsIP(newIP);
            }}
            disabled={connected}
            className="ip-display"
            placeholder="PS5 IP ADDRESS"
          />
          {!connected ? (
            <button onClick={handleConnect} className="btn btn-connect">INIT LINK</button>
          ) : (
            <button onClick={handleDisconnect} className="btn btn-disconnect">UNLINK</button>
          )}
          <div className={`status-led ${connected ? 'active' : ''}`} />
        </div>
        
        {/* Track Capture Controls */}
        <div className="capture-cluster">
          {captureStatus?.isActive ? (
            <>
              <div className="capture-status">
                <span className="capture-indicator active">●</span>
                <span className="capture-info">
                  Recording {captureStatus.trackId} ({captureStatus.points?.length || 0} pts)
                  {telemetry && (
                    <span className="capture-position">
                      [{telemetry.position?.x?.toFixed(0) || '?'}, {telemetry.position?.z?.toFixed(0) || '?'}] 
                      @ {telemetry.speedKmh?.toFixed(0) || 0} km/h
                    </span>
                  )}
                </span>
              </div>
              <button onClick={handleStopCapture} className="btn btn-capture-stop">STOP CAPTURE</button>
            </>
          ) : (
            <>
              <button 
                onClick={handleStartCapture} 
                className="btn btn-capture-start"
                disabled={!selectedTrackId}
                title={!selectedTrackId ? 'Select a track first' : 'Start recording track data from replay. Make sure GT7 is connected and replay is playing.'}
              >
                START CAPTURE
              </button>
              {captureStatus && captureStatus.points && captureStatus.points.length > 0 && (
                <button onClick={handleProcessCapture} className="btn btn-capture-process">
                  PROCESS & SAVE ({captureStatus.points.length})
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="dash-grid">
        {connected && telemetry ? (
          <>
            {/* LEFT COLUMN: LAP TIMES */}
            <div className="col-laps">
              <div className="panel timing-board">
                <h3><span className="skew">LAP TIMING</span></h3>
                {(() => {
                  // Calculate fastest lap and most recent lap for color coding
                  const fastestLap = lapTimes.length > 0 
                    ? lapTimes.reduce((fastest, lap) => lap.time < fastest.time ? lap : fastest)
                    : null;
                  const mostRecentLap = lapTimes.length > 0 ? lapTimes[0] : null;
                  const prevLap = lapTimes.length > 1 ? lapTimes[1] : null; // Second most recent
                  
                  // Determine current lap color
                  let currentColorClass = '';
                  if (telemetry.lastLapTime > 0) {
                    if (telemetry.lastLapTime === telemetry.bestLapTime) {
                      currentColorClass = 'best'; // Green - best lap
                    } else if (fastestLap && telemetry.lastLapTime === fastestLap.time) {
                      currentColorClass = 'fastest'; // Purple - fastest lap
                    } else if (mostRecentLap && telemetry.lastLapTime === mostRecentLap.time) {
                      currentColorClass = 'recent'; // Blue - most recent
                    }
                    // White is default (no class)
                  }
                  
                  // Determine previous lap color
                  let prevColorClass = '';
                  if (prevLap) {
                    if (prevLap.isBest) {
                      prevColorClass = 'best'; // Green
                    } else if (fastestLap && prevLap.time === fastestLap.time) {
                      prevColorClass = 'fastest'; // Purple
                    }
                    // White is default (no class)
                  }
                  
                  return (
                    <>
                      <div className="time-row">
                        <span className="label">CURRENT</span>
                        <span className={`value ${currentColorClass}`}>{formatLapTime(telemetry.lastLapTime)}</span>
                      </div>
                      <div className="time-row">
                        <span className="label">PREV</span>
                        <span className={`value ${prevColorClass}`}>
                          {prevLap ? formatLapTime(prevLap.time) : '--:--.---'}
                        </span>
                      </div>
                      <div className="time-row">
                        <span className="label">BEST</span>
                        <span className="value best">{formatLapTime(telemetry.bestLapTime)}</span>
                      </div>
                      <div className="time-row small">
                        <span className="label">LAPS</span>
                        <span className="value">{telemetry.currentLap}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="panel lap-list-panel">
                <h3><span className="skew">LAP TIMES</span></h3>
                <div className="lap-list">
                  {lapTimes.length > 0 ? (() => {
                    // Find fastest lap (lowest time)
                    const fastestLap = lapTimes.reduce((fastest, lap) => 
                      lap.time < fastest.time ? lap : fastest
                    );
                    
                    return lapTimes.map((lap, index) => {
                      const formattedTime = formatLapTime(lap.time);
                      const isMostRecent = index === 0; // First in sorted array (descending)
                      const isFastest = lap.time === fastestLap.time;
                      const isBest = lap.isBest;
                      
                      // Determine color class
                      let colorClass = '';
                      if (isBest) {
                        colorClass = 'best'; // Green
                      } else if (isFastest) {
                        colorClass = 'fastest'; // Purple
                      } else if (isMostRecent) {
                        colorClass = 'recent'; // Blue
                      }
                      // White is default (no class)
                      
                      return (
                        <div 
                          key={lap.lapNumber} 
                          className={`lap-item ${colorClass}`}
                        >
                          <span className="lap-number">L{lap.lapNumber}</span>
                          <span className="lap-time">{formattedTime || '--:--.---'}</span>
                          {isBest && <span className="lap-badge">BEST</span>}
                        </div>
                      );
                    });
                  })() : (
                    <div className="lap-list-empty">No laps recorded yet</div>
                  )}
                </div>
              </div>

              <div className="panel sector-board">
                 <h3><span className="skew">SECTORS</span></h3>
                 <SectorRow num={1} time={telemetry.sector1Time} active={telemetry.currentSector === 1} />
                 <SectorRow num={2} time={telemetry.sector2Time} active={telemetry.currentSector === 2} />
                 <SectorRow num={3} time={telemetry.sector3Time} active={telemetry.currentSector === 3} />
              </div>

              <div className="panel track-info">
                 <div className="info-item">
                    <label>MAP</label>
                    <span>{telemetry.trackName || "NO DATA"}</span>
                 </div>
                 <div className="info-item">
                    <label>CAR</label>
                    <span>{telemetry.carName || `ID: ${telemetry.carId}`}</span>
                 </div>
                 {trackMap && (
                   <>
                     <div className="info-item">
                        <label>TRACK MAP</label>
                        <span className="track-map-status">
                          ✓ {trackMap.lengthMeters.toFixed(0)}m
                          {trackMap.sectorFractions && trackMap.sectorFractions.length > 0 ? ' • Sectors' : ' • No sectors'}
                        </span>
                     </div>
                     {trackMap.sectorFractions && trackMap.sectorFractions.length >= 2 && (
                       <div className="info-item">
                          <label>SECTORS</label>
                          <span>
                            S1: {(trackMap.sectorFractions[0] * 100).toFixed(1)}% | 
                            S2: {((trackMap.sectorFractions[1] - trackMap.sectorFractions[0]) * 100).toFixed(1)}% | 
                            S3: {((1 - trackMap.sectorFractions[1]) * 100).toFixed(1)}%
                          </span>
                       </div>
                     )}
                   </>
                 )}
              </div>
            </div>

            {/* RIGHT COLUMN: TIRE TEMPERATURES */}
            <div className="col-tires">
               <div className="panel tire-panel">
                  <h3><span className="skew">THERMALS</span></h3>
                  {telemetry.tireTemperatures ? (
                    <div className="tire-chassis">
                      <TireBox pos="FL" temp={telemetry.tireTemperatures.frontLeft} />
                      <TireBox pos="FR" temp={telemetry.tireTemperatures.frontRight} />
                      <div className="car-outline" />
                      <TireBox pos="RL" temp={telemetry.tireTemperatures.rearLeft} />
                      <TireBox pos="RR" temp={telemetry.tireTemperatures.rearRight} />
                    </div>
                  ) : (
                    <div className="no-data">NO SENSORS</div>
                  )}
               </div>

               <div className="panel fuel-panel">
                  <h3><span className="skew">FUEL CELL</span></h3>
                  <div className="fuel-gauge">
                    {(() => {
                      // Calculate fuel percentage: fuelLevel might be in liters or fraction
                      // If fuelCapacity > 0, assume fuelLevel is in liters and calculate percentage
                      // Otherwise, assume fuelLevel is already a fraction (0-1)
                      const fuelPercent = telemetry.fuelCapacity > 0 
                        ? Math.max(0, Math.min(100, (telemetry.fuelLevel / telemetry.fuelCapacity) * 100))
                        : Math.max(0, Math.min(100, telemetry.fuelLevel * 100));
                      
                      // Color based on fuel level
                      let fuelColor = '#34c759'; // Green
                      if (fuelPercent < 25) fuelColor = '#ff3b30'; // Red
                      else if (fuelPercent < 50) fuelColor = '#ffcc00'; // Yellow
                      
                      return (
                        <div 
                          className="fuel-bar" 
                          style={{
                            width: `${fuelPercent}%`,
                            backgroundColor: fuelColor,
                            transition: 'width 0.2s linear, background-color 0.3s ease'
                          }} 
                        />
                      );
                    })()}
                  </div>
                  <div className="fuel-stats">
                    <div className="stat">
                        {(() => {
                          const fuelPercent = telemetry.fuelCapacity > 0 
                            ? Math.max(0, Math.min(100, (telemetry.fuelLevel / telemetry.fuelCapacity) * 100))
                            : Math.max(0, Math.min(100, telemetry.fuelLevel * 100));
                          return <span className="val">{fuelPercent.toFixed(1)}%</span>;
                        })()}
                        <span className="lbl">LEVEL</span>
                    </div>
                    <div className="stat">
                        <span className="val">{telemetry.fuelCapacity > 0 ? telemetry.fuelCapacity.toFixed(1) : '--'}L</span>
                        <span className="lbl">CAP</span>
                    </div>
                  </div>
               </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
             <div className="scan-line"></div>
             <h1>AWAITING TELEMETRY</h1>
             <p>{connected ? "SESSION NOT STARTED" : "SYSTEM DISCONNECTED"}</p>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Sub Components ---

function SectorRow({ num, time, active }: { num: number, time?: number, active: boolean }) {
  return (
    <div className={`sector-row ${active ? 'active' : ''}`}>
      <span className="sec-id">S{num}</span>
      <span className="sec-time">{time ? formatSectorTime(time) : '--.---'}</span>
    </div>
  );
}

function TireBox({ pos, temp }: { pos: string, temp: number }) {
  // Simple heat map logic
  let color = 'var(--text-dim)'; 
  if (temp > 70) color = '#5fc9f8'; // Cold/Warm
  if (temp > 85) color = '#34c759'; // Optimal
  if (temp > 105) color = '#ffcc00'; // Hot
  if (temp > 120) color = '#ff3b30'; // Overheat

  return (
    <div className="tire-box">
       <span className="tire-pos">{pos}</span>
       <span className="tire-temp" style={{ color }}>{temp.toFixed(0)}°</span>
    </div>
  );
}

// --- Helpers ---

function formatLapTime(ms: number): string {
  if (ms <= 0) return '-:--.---';
  // Use integer arithmetic to avoid floating point precision errors
  const totalMs = Math.round(ms); // Round to nearest millisecond
  const totalSeconds = Math.floor(totalMs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const mil = totalMs % 1000; // Direct modulo, no floating point math
  return `${m}:${s.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

function formatSectorTime(ms: number): string {
  const s = (ms / 1000).toFixed(3);
  return s;
}

export default App;