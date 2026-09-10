/**
 * Drive map build progress — Boot/Title warm waits for chunked drawCity to finish
 * before sleeping the scene so mid-shift never wakes a half-built map.
 */
export const CITY_BUILD_ROWS_PER_CHUNK = 4;

let driveCityBuildComplete = false;

export function resetCityBuildFlags(): void {
  driveCityBuildComplete = false;
}

export function markCityBuildComplete(): void {
  driveCityBuildComplete = true;
}

export function isCityBuildComplete(): boolean {
  return driveCityBuildComplete;
}
