# Track Capture Guide

This guide explains how to capture and map GT7 tracks using the replay-based workflow.

## Overview

Track mapping allows you to:
- Get accurate track length
- Calculate precise lap fractions
- Set accurate sector boundaries
- Improve sector timing accuracy

## Phase 1: Capture a Clean Lap

### Steps:

1. **Run a Time Trial**
   - Select your track
   - Drive 1 clean lap (no off-track incidents)
   - Save the replay

2. **Enter Replay Mode**
   - Load your saved replay
   - Use **chase cam**, **hood cam**, or **cockpit cam** (avoid cinematic cameras)
   - Disable ghost cars

3. **Start Track Capture**
   - In the dashboard, select the track you're mapping
   - Click "Start Capture" (UI to be added)
   - Play the replay from start to finish

4. **Stop Capture**
   - After the lap completes, click "Stop Capture"
   - Click "Process & Save" to generate the track map

## Phase 2: Sector Boundary Discovery

After capturing a track map:

1. **Load the replay again**
   - Watch the sector times in GT7 UI
   - Note the timestamps where sector splits occur

2. **Find Sector Boundaries**
   - Use the captured track data to find (x, z) coordinates at those timestamps
   - Calculate sector fractions (e.g., 0.32, 0.67)

3. **Save Sector Fractions**
   - Use the API: `saveTrackMapSectors(trackId, [0.32, 0.67])`
   - This replaces the heuristic 0.33/0.66 boundaries with accurate ones

## API Usage

### Start Capture
```typescript
await window.gt7.startTrackCapture('mount_panorama');
```

### Stop Capture
```typescript
await window.gt7.stopTrackCapture();
```

### Process and Save
```typescript
const trackMap = await window.gt7.processAndSaveTrackCapture();
console.log('Track length:', trackMap.lengthMeters);
```

### Check Capture Status
```typescript
const status = await window.gt7.getCaptureStatus();
if (status?.isActive) {
  console.log(`Capturing ${status.points.length} points for ${status.trackId}`);
}
```

### Load Track Map
```typescript
const trackMap = await window.gt7.loadTrackMap('mount_panorama');
if (trackMap) {
  console.log('Track length:', trackMap.lengthMeters);
  console.log('Sector fractions:', trackMap.sectorFractions);
}
```

### Save Sector Fractions
```typescript
// Example: Mount Panorama sectors at 32% and 67%
await window.gt7.saveTrackMapSectors('mount_panorama', [0.32, 0.67]);
```

## How It Works

1. **Capture**: Records position (x, z), speed, and lapDistance while replay is playing
2. **Filter**: Removes points where speed < 5 km/h
3. **Downsample**: Keeps points approximately every 0.5-1.0m
4. **Process**: Calculates track length and normalizes distances
5. **Store**: Saves track map to electron-store for future use

## Integration with Sector Timing

Once a track map is loaded:
- Sector timing uses accurate track length
- Lap fractions are calculated from position, not just lapDistance
- Sector boundaries use saved fractions instead of heuristics

## Notes

- **Camera matters**: Use chase/hood/cockpit cam for accurate positions
- **Disable ghosts**: Ghost cars can cause position jumps
- **Clean laps only**: Off-track incidents will skew the centerline
- **One lap is enough**: A single clean lap provides sufficient data

