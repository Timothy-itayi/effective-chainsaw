// Car name lookup database
// Based on GT7 car IDs from community sources

// Car database - maps GT7 car IDs to names
// Source: https://github.com/ddm999/gt7info
const carDatabase: Record<number, { name: string; manufacturer: string }> = {
  // Add cars as you encounter them
  // Format: carId: { name: 'Full Car Name', manufacturer: 'Manufacturer' }
  3371: { name: 'AMG GT3 \'20', manufacturer: 'Mercedes-AMG' },
  // Add more entries here or load from external JSON
};

// You can expand this by loading from a JSON file
// For now, we'll add cars as we encounter them

export function getCarName(carId: number): string | undefined {
  return carDatabase[carId]?.name;
}

export function getCarInfo(carId: number): { name: string; manufacturer: string } | undefined {
  return carDatabase[carId];
}

// Load from external file if available
export function loadCarDatabase(data: Record<number, { name: string; manufacturer: string }>): void {
  Object.assign(carDatabase, data);
}

